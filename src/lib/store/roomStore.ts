"use client";

import { create } from "zustand";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import {
  buildBracket,
  heatWinner,
  nextMatch,
  pickHost,
  recordMatch,
  type Bracket,
  type RoundResult,
} from "@/lib/social/roomLogic";
import type { RaceCubeMove } from "./raceStore";

/**
 * Multiplayer race rooms: any number of racers plus spectators, over a
 * Supabase Realtime channel (broadcast for messages, presence for who's
 * in the room). Nothing is stored — the channel is a live relay, and a
 * room exists exactly as long as someone's in it.
 *
 * One member is the host (whoever's been there longest — every client
 * computes the same answer, and if the host leaves the next-longest
 * member takes over with the state it already has). The host owns the
 * room state — mode, round, scramble, results, bracket — and rebroadcasts
 * it on every change; everyone else just renders the latest copy.
 */

export type RoomRole = "racer" | "spectator";
export type RoomMode = "ffa" | "bracket";

export interface RoomMember {
  id: string;
  name: string;
  role: RoomRole;
  cube: boolean;
  joinedAt: number;
}

export interface RoomRound {
  n: number;
  scramble: string;
  /** Wall-clock epoch the round's clocks start at (after the countdown). */
  startAt: number;
  racers: string[];
  matchId?: string;
  done: boolean;
}

export interface RoomState {
  mode: RoomMode;
  round: RoomRound | null;
  /** Current round's finishes: id → ms, null = DNF. */
  results: Record<string, number | null>;
  history: { n: number; results: RoundResult[]; matchId?: string }[];
  bracket: Bracket | null;
  /** Everyone who's ever been in the room, so results keep a name after someone leaves. */
  names: Record<string, string>;
}

type RoomMessage =
  | { t: "state"; state: RoomState }
  | { t: "finish"; id: string; n: number; timeMs: number | null }
  | { t: "moves"; id: string; n: number; moves: RaceCubeMove[] }
  | { t: "hello" };

export const COUNTDOWN_MS = 5000;
const CODE_ALPHABET = "23456789ACDEFGHJKMNPQRTUVWXY";
const MOVE_FLUSH_MS = 150;

const emptyState = (): RoomState => ({
  mode: "ffa",
  round: null,
  results: {},
  history: [],
  bracket: null,
  names: {},
});

function randomCode(): string {
  let c = "";
  for (let i = 0; i < 5; i++)
    c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

/** The slice of a Supabase Realtime channel rooms use — narrow so tests can stand in an in-memory relay. */
export interface RoomChannel {
  on(
    type: "broadcast",
    filter: { event: string },
    cb: (msg: { payload: unknown }) => void,
  ): RoomChannel;
  on(type: "presence", filter: { event: "sync" }, cb: () => void): RoomChannel;
  subscribe(cb: (status: string) => void): unknown;
  track(payload: RoomMember): Promise<unknown>;
  send(msg: {
    type: "broadcast";
    event: string;
    payload: unknown;
  }): Promise<unknown>;
  presenceState<T>(): Record<string, T[]>;
}

export interface RoomTransport {
  channel(
    name: string,
    opts: {
      config: { broadcast: { self: boolean }; presence: { key: string } };
    },
  ): RoomChannel;
  removeChannel(ch: RoomChannel): unknown;
}

interface RoomStore {
  status: "idle" | "connecting" | "live" | "error";
  error: string | null;
  code: string | null;
  me: RoomMember | null;
  members: RoomMember[];
  hostId: string | null;
  state: RoomState;
  /** Live moves per racer for the current round. */
  moves: Record<string, RaceCubeMove[]>;

  open: (opts: {
    code?: string;
    name: string;
    role: RoomRole;
    cube: boolean;
  }) => Promise<void>;
  leave: () => void;
  setCube: (cube: boolean) => void;
  setRole: (role: RoomRole) => void;
  finish: (timeMs: number | null) => void;
  relayMove: (move: RaceCubeMove) => void;
  hostSetMode: (mode: RoomMode) => void;
  hostStartRound: () => Promise<void>;
  hostEndRound: () => void;
  hostResetBracket: () => void;
}

export function createRoomStore(deps: {
  transport: () => RoomTransport | null;
  scramble: () => Promise<string>;
}) {
  return create<RoomStore>((set, get) => {
    let channel: RoomChannel | null = null;
    let moveBuffer: RaceCubeMove[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const isHost = () => get().hostId !== null && get().hostId === get().me?.id;

    function rawSend(msg: RoomMessage) {
      void channel?.send({ type: "broadcast", event: "msg", payload: msg });
    }

    /** Sends to everyone else and applies locally (broadcast doesn't echo to self). */
    function send(msg: RoomMessage) {
      rawSend(msg);
      handle(msg);
    }

    function publish(state: RoomState) {
      send({ t: "state", state });
    }

    function withNames(state: RoomState): RoomState {
      const names = { ...state.names };
      for (const m of get().members) names[m.id] = m.name;
      return { ...state, names };
    }

    function conclude(state: RoomState): RoomState {
      const round = state.round!;
      const results: RoundResult[] = round.racers.map((id) => ({
        id,
        timeMs: state.results[id] ?? null,
      }));
      let bracket = state.bracket;
      if (bracket && round.matchId) {
        const m = bracket.rounds.flat().find((x) => x.id === round.matchId);
        const w = m ? heatWinner(m, state.results) : null;
        if (w) bracket = recordMatch(bracket, round.matchId, w);
      }
      return {
        ...state,
        round: { ...round, done: true },
        history: [
          ...state.history,
          { n: round.n, results, matchId: round.matchId },
        ],
        bracket,
      };
    }

    function handle(msg: RoomMessage) {
      if (msg.t === "state") {
        const prevN = get().state.round?.n;
        set({ state: msg.state });
        if (msg.state.round && msg.state.round.n !== prevN) set({ moves: {} });
        return;
      }
      if (msg.t === "moves") {
        if (get().state.round?.n !== msg.n) return;
        set((s) => ({
          moves: {
            ...s.moves,
            [msg.id]: [...(s.moves[msg.id] ?? []), ...msg.moves],
          },
        }));
        return;
      }
      if (msg.t === "hello") {
        if (isHost()) rawSend({ t: "state", state: get().state });
        return;
      }
      if (msg.t === "finish") {
        if (!isHost()) return;
        const st = get().state;
        const round = st.round;
        if (
          !round ||
          round.done ||
          msg.n !== round.n ||
          !round.racers.includes(msg.id) ||
          msg.id in st.results
        )
          return;
        let next: RoomState = {
          ...st,
          results: { ...st.results, [msg.id]: msg.timeMs },
        };
        if (round.racers.every((id) => id in next.results))
          next = conclude(next);
        publish(next);
      }
    }

    function syncPresence() {
      if (!channel) return;
      const raw = channel.presenceState<RoomMember>();
      const members = Object.values(raw)
        .map((arr) => arr[0])
        .filter(
          (m): m is RoomMember & { presence_ref: string } =>
            !!m && typeof m.id === "string",
        )
        .map(({ id, name, role, cube, joinedAt }) => ({
          id,
          name,
          role,
          cube,
          joinedAt,
        }));
      const wasHost = isHost();
      set({ members, hostId: pickHost(members) });
      // A newly-promoted host, or a host seeing someone new, (re)publishes so everyone has the names and the latest state.
      if (isHost()) {
        const st = withNames(get().state);
        if (
          !wasHost ||
          Object.keys(st.names).length !== Object.keys(get().state.names).length
        )
          publish(st);
      }
    }

    function flushMoves() {
      flushTimer = null;
      const me = get().me;
      const n = get().state.round?.n;
      if (!me || n === undefined || moveBuffer.length === 0) return;
      const moves = moveBuffer;
      moveBuffer = [];
      send({ t: "moves", id: me.id, n, moves });
    }

    return {
      status: "idle",
      error: null,
      code: null,
      me: null,
      members: [],
      hostId: null,
      state: emptyState(),
      moves: {},

      open: async ({ code, name, role, cube }) => {
        const supabase = deps.transport();
        if (!supabase) {
          set({
            status: "error",
            error:
              "Rooms need the app's online features, which aren't configured here.",
          });
          return;
        }
        get().leave();
        const roomCode = (code ?? randomCode()).trim().toUpperCase();
        const me: RoomMember = {
          id: randomId(),
          name: name.trim().slice(0, 24) || "Cuber",
          role,
          cube,
          joinedAt: Date.now(),
        };
        set({
          status: "connecting",
          error: null,
          code: roomCode,
          me,
          members: [],
          hostId: null,
          state: emptyState(),
          moves: {},
        });
        const ch = supabase.channel(`race-room-${roomCode}`, {
          config: { broadcast: { self: false }, presence: { key: me.id } },
        });
        channel = ch;
        ch.on("broadcast", { event: "msg" }, ({ payload }) =>
          handle(payload as RoomMessage),
        );
        ch.on("presence", { event: "sync" }, syncPresence);
        ch.subscribe(async (status) => {
          if (channel !== ch) return;
          if (status === "SUBSCRIBED") {
            await ch.track(me);
            set({ status: "live" });
            rawSend({ t: "hello" });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            set({
              status: "error",
              error:
                "Couldn't reach the room — check your connection and try again.",
            });
          }
        });
      },

      leave: () => {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
        moveBuffer = [];
        const ch = channel;
        channel = null;
        if (ch) void deps.transport()?.removeChannel(ch);
        set({
          status: "idle",
          code: null,
          me: null,
          members: [],
          hostId: null,
          state: emptyState(),
          moves: {},
          error: null,
        });
      },

      setCube: (cube) => {
        const me = get().me;
        if (!me || me.cube === cube) return;
        const next = { ...me, cube };
        set({ me: next });
        void channel?.track(next);
      },

      setRole: (role) => {
        const me = get().me;
        if (!me || me.role === role) return;
        const next = { ...me, role };
        set({ me: next });
        void channel?.track(next);
      },

      finish: (timeMs) => {
        const me = get().me;
        const round = get().state.round;
        if (!me || !round) return;
        flushMoves();
        send({ t: "finish", id: me.id, n: round.n, timeMs });
      },

      relayMove: (move) => {
        moveBuffer.push(move);
        flushTimer ??= setTimeout(flushMoves, MOVE_FLUSH_MS);
      },

      hostSetMode: (mode) => {
        if (!isHost()) return;
        const st = get().state;
        if (st.round && !st.round.done) return;
        publish(
          withNames({
            ...st,
            mode,
            bracket: mode === "bracket" ? st.bracket : null,
          }),
        );
      },

      hostStartRound: async () => {
        if (!isHost()) return;
        const st = withNames(get().state);
        if (st.round && !st.round.done) return;
        const racers = get()
          .members.filter((m) => m.role === "racer")
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .map((m) => m.id);
        let bracket = st.bracket;
        let heat: string[] = racers;
        let matchId: string | undefined;
        if (st.mode === "bracket") {
          if (!bracket || !nextMatch(bracket)) bracket = buildBracket(racers);
          const m = nextMatch(bracket);
          if (!m) return;
          heat = [m.a!, m.b!];
          matchId = m.id;
        }
        if (heat.length === 0) return;
        const scramble = await deps.scramble();
        const n = (st.round?.n ?? 0) + 1;
        publish({
          ...st,
          bracket,
          results: {},
          round: {
            n,
            scramble,
            startAt: Date.now() + COUNTDOWN_MS,
            racers: heat,
            matchId,
            done: false,
          },
        });
      },

      hostEndRound: () => {
        if (!isHost()) return;
        const st = get().state;
        if (!st.round || st.round.done) return;
        const results = { ...st.results };
        for (const id of st.round.racers)
          if (!(id in results)) results[id] = null;
        publish(conclude({ ...st, results }));
      },

      hostResetBracket: () => {
        if (!isHost()) return;
        const st = get().state;
        if (st.round && !st.round.done) return;
        publish(
          withNames({
            ...st,
            bracket: null,
            history: [],
            round: null,
            results: {},
          }),
        );
      },
    };
  });
}

export const useRoomStore = createRoomStore({
  transport: () => getSupabaseClient() as unknown as RoomTransport | null,
  scramble: () => getCubeEngineClient().generateScramble(),
});
