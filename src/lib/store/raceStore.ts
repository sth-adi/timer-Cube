"use client";

import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { createRaceRoom, deleteRaceRoom, fetchRaceRoomOffer, submitRaceRoomAnswer, waitForRaceRoomAnswer } from "@/lib/social/raceSignaling";
import { findMatch, submitMatchAnswer } from "@/lib/social/raceMatchmaking";
import { fetchRaceRating, nextRating, updateRaceRating } from "@/lib/social/raceRating";
import { useAuthStore } from "@/lib/store/authStore";
import { displayUsername } from "@/lib/auth/username";

/**
 * Live head-to-head racing over a direct WebRTC data channel. The race
 * itself — scramble, ready-up, times, moves — always goes straight between
 * the two browsers over that data channel, never through anything we run.
 *
 * The one piece two browsers can never do unassisted is finding each other
 * in the first place (WebRTC needs *some* side channel to swap a
 * connection "offer" and "answer"). The quick-connect path (hostQuick/
 * joinQuick) uses this app's Supabase project as a short-lived mailbox for
 * exactly that handshake — a 5-character room code instead of a giant
 * blob to copy/paste — see lib/social/raceSignaling.ts; the room is
 * deleted the moment the host completes the connection. If Supabase isn't
 * configured, startHosting/submitOfferCode/submitAnswerCode are the manual
 * fallback: the same handshake with the offer/answer copy-pasted by hand
 * through whatever channel the racers already have open.
 *
 * Either way, a public STUN server (Google's, the same one nearly every
 * WebRTC demo and library defaults to) is used only so each side can
 * discover its own public address for the eventual direct connection.
 *
 * If a side has a smart cube connected, its moves stream over the same data
 * channel (see the "move" WireMessage) so the other side can render a live
 * LiveCubeMimic of it — see RaceMode.tsx, which owns arming/reading the
 * local smartCubeStore and relaying it here; this store just carries the
 * bytes and the already-relayed opponentMoves for whoever's watching.
 *
 * quickMatch() is a third way in besides hosting/joining: instead of either
 * side producing a code at all, both sides drop their offer into a shared
 * Supabase queue (see lib/social/raceMatchmaking.ts) and either claim
 * someone already waiting or wait to be claimed — a race against a
 * stranger, one tap, no code to share with anyone.
 *
 * Signed-in racers also exchange a Chess.com-style Elo rating over the data
 * channel right after connecting (see the "rating" WireMessage) and each
 * side independently updates its own row in race_ratings once a race
 * finishes — see lib/social/raceRating.ts for the formula and why there's
 * no server refereeing it.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_GATHER_TIMEOUT_MS = 6000;
const COUNTDOWN_MS = 3000;

/** Wire shape for a relayed smart-cube move — same fields as smartCubeStore's own SmartCubeMove, kept independent so raceStore never has to import that store's types. */
export interface RaceCubeMove {
  token: string;
  timeStampMs: number;
}

type WireMessage =
  | { t: "scramble"; scramble: string }
  | { t: "ready"; ready: boolean }
  | { t: "start"; atMs: number }
  | { t: "finished"; timeMs: number }
  | { t: "hasCube"; hasCube: boolean }
  | { t: "move"; token: string; timeStampMs: number }
  | { t: "rating"; rating: number };

export type RaceMode = "idle" | "hosting" | "joining";
export type RaceState = "lobby" | "countdown" | "running" | "finished";

interface RaceStoreState {
  mode: RaceMode;
  busy: boolean;
  error: string | null;
  /** The blob you share with your opponent — your offer (host) or your answer (joiner). Manual-flow fallback only; the quick-connect path never shows this unless it fails. */
  localCode: string | null;
  /** The short code shown to the host once a quick-connect room is up, or typed in by the joiner. Null while using the manual fallback. */
  roomCode: string | null;
  connected: boolean;
  scramble: string | null;
  myReady: boolean;
  opponentReady: boolean;
  startAtMs: number | null;
  raceState: RaceState;
  myTimeMs: number | null;
  opponentTimeMs: number | null;
  /** Whether a connected smart cube is driving this device's side of the race — reported the moment RaceMode knows, so the other side can decide whether to render a live cube visual or just a timer. */
  myHasSmartCube: boolean;
  opponentHasSmartCube: boolean;
  /** Every move the opponent's smart cube has reported so far this attempt — feeds a LiveCubeMimic on this side, same shape it already consumes locally in SmartCubeTimer. */
  opponentMoves: RaceCubeMove[];
  /** True only while quickMatch() is actively searching — distinct from `busy` (which also covers e.g. a code lookup) so the UI can show "Finding an opponent…" specifically. */
  matchmaking: boolean;
  /** This account's current race rating, once fetched/settled — null if signed out or not yet known. */
  myRating: number | null;
  /** The opponent's rating, if they're signed in and it's arrived over the data channel. */
  opponentRating: number | null;
  /** How much myRating just moved, shown once on the finished screen — null before a rating-eligible race has settled, or if either side isn't signed in. */
  ratingDelta: number | null;

  startHosting: () => Promise<void>;
  startJoining: () => void;
  submitOfferCode: (code: string) => Promise<void>;
  submitAnswerCode: (code: string) => Promise<void>;
  /** Quick-connect: generates the offer, publishes it under a fresh room code, and waits for a joiner's answer to arrive — no manual code exchange at all. Falls back to leaving `error` set (the manual flow underneath is unaffected) if Supabase isn't reachable. */
  hostQuick: () => Promise<void>;
  /** Quick-connect: looks up the room by code, answers it, and hands the answer back through the same room. */
  joinQuick: (code: string) => Promise<void>;
  /** No code at all: claims a stranger's waiting offer if one exists, otherwise posts our own and waits to be claimed. */
  quickMatch: () => Promise<void>;
  setReady: (ready: boolean) => void;
  finish: (timeMs: number) => void;
  rematch: () => Promise<void>;
  disconnect: () => void;
  reset: () => void;
  setMyHasSmartCube: (hasCube: boolean) => void;
  reportMove: (token: string, timeStampMs: number) => void;
}

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let isHost = false;
let roomAbort: AbortController | null = null;
/** Guards the rating update against firing twice for the same finished race (once from finish(), once from the "finished" message handler, whichever runs second) — reset at the start of every new round. */
let ratingSettled = false;

function encode(desc: RTCSessionDescriptionInit): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(desc))));
}

function decode(code: string): RTCSessionDescriptionInit {
  return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
}

function waitForIceGatheringComplete(conn: RTCPeerConnection): Promise<void> {
  if (conn.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      conn.removeEventListener("icegatheringstatechange", done);
      clearTimeout(timeoutId);
      resolve();
    };
    conn.addEventListener("icegatheringstatechange", () => {
      if (conn.iceGatheringState === "complete") done();
    });
    const timeoutId = window.setTimeout(done, ICE_GATHER_TIMEOUT_MS);
  });
}

function send(message: WireMessage): void {
  if (dc?.readyState === "open") dc.send(JSON.stringify(message));
}

export const useRaceStore = create<RaceStoreState>((set, get) => {
  function wireDataChannel(channel: RTCDataChannel) {
    dc = channel;
    channel.onopen = () => {
      set({ connected: true, busy: false, matchmaking: false, error: null, roomCode: null });
      // The host is the one who picked the scramble (during startHosting,
      // before the joiner even existed) — hand it over now that there's
      // finally a channel to send it on.
      if (isHost) {
        const { scramble } = get();
        if (scramble) send({ t: "scramble", scramble });
      }
      // Rating is per-account, not per-role — both sides look themselves up
      // and send it, independent of who's hosting vs joining.
      const user = useAuthStore.getState().user;
      if (user) {
        void fetchRaceRating(user.id).then(({ rating }) => {
          set({ myRating: rating });
          send({ t: "rating", rating });
        });
      }
    };
    channel.onclose = () => set({ connected: false });
    channel.onmessage = (event) => {
      let msg: WireMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "scramble") {
        ratingSettled = false;
        set({
          scramble: msg.scramble,
          myReady: false,
          opponentReady: false,
          startAtMs: null,
          raceState: "lobby",
          myTimeMs: null,
          opponentTimeMs: null,
          opponentMoves: [],
          ratingDelta: null,
        });
      } else if (msg.t === "ready") {
        set({ opponentReady: msg.ready });
        maybeStartRace();
      } else if (msg.t === "start") {
        scheduleCountdown(msg.atMs);
      } else if (msg.t === "finished") {
        set({ opponentTimeMs: msg.timeMs });
        const { myTimeMs } = get();
        if (myTimeMs !== null) {
          set({ raceState: "finished" });
          settleRating();
        }
      } else if (msg.t === "hasCube") {
        set({ opponentHasSmartCube: msg.hasCube });
      } else if (msg.t === "move") {
        set((s) => ({ opponentMoves: [...s.opponentMoves, { token: msg.token, timeStampMs: msg.timeStampMs }] }));
      } else if (msg.t === "rating") {
        set({ opponentRating: msg.rating });
      }
    };
  }

  /**
   * Fires once per finished race, from whichever side's finish arrives
   * second (see finish() and the "finished" message handler above) — each
   * side computes and writes only its own new rating, using the ratings
   * both sides exchanged at connect time (see wireDataChannel's onopen).
   * A no-op if either side is signed out (no rating to update) or the race
   * was an exact tie (no well-defined winner for the Elo formula).
   */
  function settleRating() {
    if (ratingSettled) return;
    const { myTimeMs, opponentTimeMs, myRating, opponentRating } = get();
    if (myTimeMs === null || opponentTimeMs === null || myRating === null || opponentRating === null) return;
    if (myTimeMs === opponentTimeMs) return;
    ratingSettled = true;
    const user = useAuthStore.getState().user;
    if (!user) return;
    const won = myTimeMs < opponentTimeMs;
    const newRating = nextRating(myRating, opponentRating, won);
    set({ myRating: newRating, ratingDelta: newRating - myRating });
    void updateRaceRating(user.id, displayUsername(user), newRating, won);
  }

  function scheduleCountdown(atMs: number) {
    set({ startAtMs: atMs, raceState: "countdown" });
    const delay = Math.max(0, atMs - Date.now());
    window.setTimeout(() => {
      if (get().raceState === "countdown") set({ raceState: "running" });
    }, delay);
  }

  function maybeStartRace() {
    if (!isHost) return;
    const { myReady, opponentReady, raceState } = get();
    if (myReady && opponentReady && raceState === "lobby") {
      const atMs = Date.now() + COUNTDOWN_MS;
      send({ t: "start", atMs });
      scheduleCountdown(atMs);
    }
  }

  function teardown() {
    dc?.close();
    pc?.close();
    dc = null;
    pc = null;
    isHost = false;
    ratingSettled = false;
    roomAbort?.abort();
    roomAbort = null;
  }

  return {
    mode: "idle",
    busy: false,
    error: null,
    localCode: null,
    roomCode: null,
    connected: false,
    scramble: null,
    myReady: false,
    opponentReady: false,
    startAtMs: null,
    raceState: "lobby",
    myTimeMs: null,
    opponentTimeMs: null,
    myHasSmartCube: false,
    opponentHasSmartCube: false,
    opponentMoves: [],
    matchmaking: false,
    myRating: null,
    opponentRating: null,
    ratingDelta: null,

    startHosting: async () => {
      teardown();
      isHost = true;
      set({ mode: "hosting", busy: true, error: null, localCode: null });
      try {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        wireDataChannel(conn.createDataChannel("race"));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await waitForIceGatheringComplete(conn);
        const scramble = await getCubeEngineClient().generateScramble();
        set({ localCode: encode(conn.localDescription!), scramble, busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    startJoining: () => set({ mode: "joining", error: null, localCode: null }),

    submitOfferCode: async (code) => {
      teardown();
      isHost = false;
      set({ busy: true, error: null });
      try {
        const offer = decode(code);
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        conn.ondatachannel = (event) => wireDataChannel(event.channel);
        await conn.setRemoteDescription(offer);
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await waitForIceGatheringComplete(conn);
        set({ localCode: encode(conn.localDescription!), busy: false });
      } catch {
        set({ busy: false, error: "That code didn't work — double check it was copied in full." });
      }
    },

    submitAnswerCode: async (code) => {
      if (!pc) return;
      set({ busy: true, error: null });
      try {
        const answer = decode(code);
        await pc.setRemoteDescription(answer);
        set({ busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : "That code didn't work." });
      }
    },

    hostQuick: async () => {
      teardown();
      isHost = true;
      const abort = new AbortController();
      roomAbort = abort;
      set({ mode: "hosting", busy: true, error: null, localCode: null, roomCode: null });
      try {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        wireDataChannel(conn.createDataChannel("race"));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await waitForIceGatheringComplete(conn);
        const scramble = await getCubeEngineClient().generateScramble();
        const offerCode = encode(conn.localDescription!);
        const code = await createRaceRoom(offerCode);
        if (!code) {
          // No Supabase (or it's unreachable) — fall back to the manual code, same as startHosting.
          set({ localCode: offerCode, scramble, busy: false, error: "Couldn't create a quick room — use the code below instead." });
          return;
        }
        // Keep the manual offer code around too (unused unless the quick-connect wait fails or the racer opts into the fallback UI).
        set({ roomCode: code, localCode: offerCode, scramble, busy: false });
        const answer = await waitForRaceRoomAnswer(code, abort.signal);
        if (abort.signal.aborted || !pc) return;
        if (!answer) {
          set({ error: "Nobody joined in time — try hosting again.", roomCode: null });
          return;
        }
        await pc.setRemoteDescription(decode(answer));
        void deleteRaceRoom(code);
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    joinQuick: async (code) => {
      teardown();
      isHost = false;
      const abort = new AbortController();
      roomAbort = abort;
      const normalized = code.trim().toUpperCase();
      set({ mode: "joining", busy: true, error: null, localCode: null, roomCode: normalized });
      try {
        const offer = await fetchRaceRoomOffer(normalized);
        if (abort.signal.aborted) return;
        if (!offer) {
          set({ busy: false, roomCode: null, error: "That room code wasn't found — check it and try again." });
          return;
        }
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        conn.ondatachannel = (event) => wireDataChannel(event.channel);
        await conn.setRemoteDescription(decode(offer));
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await waitForIceGatheringComplete(conn);
        await submitRaceRoomAnswer(normalized, encode(conn.localDescription!));
        set({ busy: false });
      } catch (err) {
        set({ busy: false, roomCode: null, error: err instanceof Error ? err.message : "Couldn't join that room." });
      }
    },

    quickMatch: async () => {
      teardown();
      const abort = new AbortController();
      roomAbort = abort;
      set({ mode: "hosting", busy: true, matchmaking: true, error: null, localCode: null, roomCode: null });
      try {
        // Only built if the initial claim attempt (inside findMatch) comes
        // up empty and we have to post our own offer and wait — captured
        // here (in a plain object rather than bare `let`s, so TS doesn't
        // lose track of the type across the closure below) so the
        // "offerer" branch can pick the same connection back up rather
        // than building a second one.
        const offerer: { conn: RTCPeerConnection | null; channel: RTCDataChannel | null; scramble: string | null } = {
          conn: null,
          channel: null,
          scramble: null,
        };

        const outcome = await findMatch(async () => {
          const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          offerer.conn = conn;
          offerer.channel = conn.createDataChannel("race");
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          await waitForIceGatheringComplete(conn);
          offerer.scramble = await getCubeEngineClient().generateScramble();
          return encode(conn.localDescription!);
        }, abort.signal);

        if (abort.signal.aborted) {
          offerer.conn?.close();
          return;
        }
        if (!outcome) {
          offerer.conn?.close();
          set({ busy: false, matchmaking: false, error: "No one else is racing right now — try a room code instead, or try again in a bit." });
          return;
        }

        if (outcome.role === "offerer") {
          if (!offerer.conn || !offerer.channel) throw new Error("Matchmaking connection went missing.");
          isHost = true;
          pc = offerer.conn;
          wireDataChannel(offerer.channel);
          await offerer.conn.setRemoteDescription(decode(outcome.answer));
          set({ scramble: offerer.scramble, busy: false });
        } else {
          isHost = false;
          set({ mode: "joining" });
          const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pc = conn;
          conn.ondatachannel = (event) => wireDataChannel(event.channel);
          await conn.setRemoteDescription(decode(outcome.offer));
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          await waitForIceGatheringComplete(conn);
          await submitMatchAnswer(outcome.rowId, encode(conn.localDescription!));
          set({ busy: false });
        }

        // Safety net for the vanishingly rare case where the handshake
        // doesn't actually finish (e.g. a clock-skew edge case around the
        // tie-break in findMatch) — without this, a stuck peer connection
        // would leave the UI on "Finding an opponent…" forever.
        window.setTimeout(() => {
          if (!abort.signal.aborted && get().matchmaking && !get().connected) {
            set({ matchmaking: false, error: "Couldn't complete the match — try again." });
          }
        }, 20000);
      } catch (err) {
        set({ busy: false, matchmaking: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    setReady: (ready) => {
      set({ myReady: ready });
      send({ t: "ready", ready });
      maybeStartRace();
    },

    finish: (timeMs) => {
      set({ myTimeMs: timeMs });
      send({ t: "finished", timeMs });
      const { opponentTimeMs } = get();
      if (opponentTimeMs !== null) {
        set({ raceState: "finished" });
        settleRating();
      }
    },

    rematch: async () => {
      if (!isHost) return;
      ratingSettled = false;
      const scramble = await getCubeEngineClient().generateScramble();
      set({
        scramble,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        opponentMoves: [],
        ratingDelta: null,
      });
      send({ t: "scramble", scramble });
    },

    disconnect: () => {
      teardown();
      set({
        mode: "idle",
        busy: false,
        localCode: null,
        roomCode: null,
        connected: false,
        scramble: null,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        myHasSmartCube: false,
        opponentHasSmartCube: false,
        opponentMoves: [],
        matchmaking: false,
        opponentRating: null,
        ratingDelta: null,
      });
    },

    reset: () => {
      teardown();
      set({
        mode: "idle",
        busy: false,
        error: null,
        localCode: null,
        roomCode: null,
        connected: false,
        scramble: null,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        myHasSmartCube: false,
        opponentHasSmartCube: false,
        opponentMoves: [],
        matchmaking: false,
        opponentRating: null,
        ratingDelta: null,
      });
    },

    setMyHasSmartCube: (hasCube) => {
      set({ myHasSmartCube: hasCube });
      send({ t: "hasCube", hasCube });
    },

    reportMove: (token, timeStampMs) => {
      send({ t: "move", token, timeStampMs });
    },
  };
});
