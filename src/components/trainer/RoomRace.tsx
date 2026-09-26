"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bluetooth, Copy, Crown, Eye, Flag, Loader2, LogOut, Play, RotateCcw, Trophy, Users } from "lucide-react";
import { COUNTDOWN_MS, useRoomStore, type RoomMode, type RoomRole, type RoomRound } from "@/lib/store/roomStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useAuthStore } from "@/lib/store/authStore";
import { useSmartCubeFlow } from "@/hooks/useSmartCubeFlow";
import { displayUsername } from "@/lib/auth/username";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { champion, nextMatch, rankRound, standings, type Bracket } from "@/lib/social/roomLogic";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const NAME_KEY = "cube-room-name";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

function Lobby() {
  const user = useAuthStore((s) => s.user);
  const open = useRoomStore((s) => s.open);
  const error = useRoomStore((s) => s.error);
  const cube = useSmartCubeStore((s) => s.connected);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState("");
  const [role, setRole] = useState<RoomRole>("racer");
  const effectiveName = name.trim() || (user ? displayUsername(user) : "Cuber");

  const go = (joinCode?: string) => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // Private mode: the name just isn't remembered.
    }
    void open({ code: joinCode, name: effectiveName, role, cube });
  };

  if (!isSupabaseConfigured()) {
    return <p className="text-xs text-muted-2">Rooms need the app&apos;s online features, which aren&apos;t configured in this build.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted">
        A room holds any number of racers and spectators. Everyone gets the same scramble each round; smart-cube racers show up as live
        cubes everyone can watch. Race free-for-all for points, or run a knockout bracket.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={effectiveName}
        maxLength={24}
        className="rounded-lg bg-bg-panel-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-2"
        aria-label="Your name in the room"
      />
      <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1 text-xs">
        {(
          [
            ["racer", "Race", Flag],
            ["spectator", "Spectate", Eye],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRole(id)}
            aria-pressed={role === id}
            className={cn("flex items-center justify-center gap-1 rounded-full py-1.5 font-semibold", role === id ? "bg-accent text-accent-fg" : "text-muted")}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => go()} className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg">
        <Users size={15} /> Create a room
      </button>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Room code"
          maxLength={5}
          className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-3 py-2 font-mono text-sm uppercase tracking-widest text-foreground outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-2"
        />
        <button
          type="button"
          disabled={code.trim().length !== 5}
          onClick={() => go(code)}
          className="rounded-lg bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground disabled:opacity-40"
        >
          Join
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Your own heat: countdown, then a tap/space-to-stop clock — or, on a smart cube, the usual scramble → inspection → auto-stop flow. */
function MyHeat({ round }: { round: RoomRound }) {
  const finish = useRoomStore((s) => s.finish);
  const relayMove = useRoomStore((s) => s.relayMove);
  const myResult = useRoomStore((s) => (s.me ? s.state.results[s.me.id] : undefined));
  const cube = useSmartCubeStore((s) => s.connected);
  const scMoves = useSmartCubeStore((s) => s.moves);
  const scStarted = useSmartCubeStore((s) => s.startedAtMs);
  const scSolved = useSmartCubeStore((s) => s.solvedAtMs);
  const flow = useSmartCubeFlow(round.scramble);
  const finished = myResult !== undefined;
  const now = useNow(!finished);
  const running = now >= round.startAt;
  const stoppedRef = useRef(false);

  const stop = () => {
    if (stoppedRef.current || !running || finished) return;
    stoppedRef.current = true;
    finish(Date.now() - round.startAt);
  };

  useEffect(() => {
    if (cube) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (stoppedRef.current || finished || Date.now() < round.startAt) return;
      stoppedRef.current = true;
      finish(Date.now() - round.startAt);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cube, finished, round.startAt, finish]);

  // Relay every new cube move (batched in the store) so the room can watch.
  const relayed = useRef(0);
  useEffect(() => {
    if (scMoves.length === 0) relayed.current = 0;
    if (!cube || finished) return;
    for (let i = relayed.current; i < scMoves.length; i++) relayMove({ token: scMoves[i].token, timeStampMs: scMoves[i].timeStampMs });
    relayed.current = scMoves.length;
  }, [scMoves, cube, finished, relayMove]);

  // Smart cube: the cube's own clock decides the time, same as a 1v1 race.
  const autoAt = useRef<number | null>(null);
  useEffect(() => {
    if (!cube || finished || scSolved === null || scStarted === null || autoAt.current === scSolved) return;
    autoAt.current = scSolved;
    stoppedRef.current = true;
    finish(scSolved - scStarted);
  }, [cube, finished, scSolved, scStarted, finish]);

  const countdown = Math.ceil((round.startAt - now) / 1000);
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-accent">Your heat</p>
      {finished ? (
        <p className="tabular-timer w-full rounded-xl bg-success/15 py-5 text-center text-3xl font-bold text-success">
          {myResult === null ? "DNF" : formatTime(myResult)}
        </p>
      ) : cube ? (
        <div className="w-full rounded-xl bg-bg-panel-2 py-4 text-center">
          <p className="text-sm font-semibold text-foreground">
            {flow.phase === "scrambling"
              ? "Scramble your cube to match"
              : flow.phase === "inspecting"
                ? `Inspecting · ${Math.ceil(flow.inspectionRemainingMs / 1000)}s`
                : scStarted !== null
                  ? "Solving…"
                  : "Start turning when you're ready"}
          </p>
          <p className="text-[11px] text-muted-2">Your cube stops the clock when it reads solved.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={stop}
          disabled={!running}
          className="tabular-timer w-full rounded-xl bg-bg-panel-2 py-6 text-center text-3xl font-bold text-foreground active:opacity-80 disabled:text-muted"
        >
          {running ? formatTime(now - round.startAt) : countdown > 0 ? countdown : "GO"}
        </button>
      )}
      {!finished && (
        <button type="button" onClick={() => finish(null)} className="text-[11px] font-medium text-muted-2 hover:text-danger">
          Give up (DNF)
        </button>
      )}
    </div>
  );
}

/** Someone else in the heat: their finish, their live cube, or just their clock. */
function RacerTile({ id, round }: { id: string; round: RoomRound }) {
  const name = useRoomStore((s) => s.state.names[id] ?? s.members.find((m) => m.id === id)?.name ?? "Racer");
  const cube = useRoomStore((s) => s.members.find((m) => m.id === id)?.cube ?? false);
  const moves = useRoomStore((s) => s.moves[id]);
  const result = useRoomStore((s) => s.state.results[id]);
  const done = result !== undefined;
  const now = useNow(!done && !round.done);
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg-panel-2 p-2">
      <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-foreground">
        {cube && <Bluetooth size={10} className="shrink-0 text-accent" />}
        {name}
      </p>
      {done ? (
        <p className="tabular-timer py-3 text-center text-xl font-bold text-foreground">{result === null ? "DNF" : formatTime(result)}</p>
      ) : moves && moves.length > 0 ? (
        <div className="h-24 w-full overflow-hidden rounded-lg">
          <LiveCubeMimic scramble={round.scramble} moves={moves} className="h-full w-full" />
        </div>
      ) : (
        <p className="tabular-timer py-3 text-center text-xl font-bold text-muted">
          {now < round.startAt ? "…" : round.done ? "DNF" : formatTime(now - round.startAt)}
        </p>
      )}
    </div>
  );
}

function BracketView({ bracket, names }: { bracket: Bracket; names: Record<string, string> }) {
  const live = nextMatch(bracket);
  const label = (id: string | null) => (id ? (names[id] ?? "Racer") : "bye");
  const roundName = (r: number) => (r === bracket.rounds.length - 1 ? "Final" : r === bracket.rounds.length - 2 ? "Semis" : `Round ${r + 1}`);
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {bracket.rounds.map((round, r) => (
        <div key={r} className="flex min-w-[8.5rem] flex-col justify-around gap-2">
          <p className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-2">{roundName(r)}</p>
          {round.map((m) => (
            <div key={m.id} className={cn("flex flex-col rounded-lg bg-bg-panel-2 text-[11px]", live?.id === m.id && "ring-2 ring-accent")}>
              {[m.a, m.b].map((id, i) => (
                <span
                  key={i}
                  className={cn(
                    "truncate px-2 py-1",
                    i === 0 && "border-b border-border",
                    m.winner && id === m.winner ? "font-bold text-success" : m.winner ? "text-muted-2 line-through" : "text-foreground",
                    !id && "italic text-muted-2",
                  )}
                >
                  {m.round > 0 && !id && !m.winner ? "—" : label(id)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LiveRoom() {
  const code = useRoomStore((s) => s.code);
  const status = useRoomStore((s) => s.status);
  const me = useRoomStore((s) => s.me);
  const members = useRoomStore((s) => s.members);
  const hostId = useRoomStore((s) => s.hostId);
  const state = useRoomStore((s) => s.state);
  const { leave, setCube, setRole, hostSetMode, hostStartRound, hostEndRound, hostResetBracket } = useRoomStore.getState();
  const cube = useSmartCubeStore((s) => s.connected);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => setCube(cube), [cube, setCube]);

  const isHost = !!me && hostId === me.id;
  const round = state.round;
  const live = !!round && !round.done;
  const inHeat = !!me && !!round && round.racers.includes(me.id);
  const racers = members.filter((m) => m.role === "racer");
  const table = useMemo(() => standings(state.history.map((h) => h.results)), [state.history]);
  const lastPlacings = useMemo(() => {
    const last = state.history[state.history.length - 1];
    return round?.done && last?.n === round.n ? rankRound(last.results) : null;
  }, [state.history, round]);
  const champ = state.bracket ? champion(state.bracket) : null;
  const upcoming = state.mode === "bracket" && state.bracket ? nextMatch(state.bracket) : null;
  const nameOf = (id: string) => state.names[id] ?? members.find((m) => m.id === id)?.name ?? "Racer";
  const now = useNow(live);

  const start = async () => {
    setStarting(true);
    await hostStartRound();
    setStarting(false);
  };

  if (status === "connecting") {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
        <Loader2 size={16} className="animate-spin text-accent" /> Joining room {code}…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!code) return;
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-3 py-1.5"
        >
          <span className="font-mono text-lg font-black tracking-[0.25em] text-foreground">{code}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted">
            <Copy size={11} /> {copied ? "Copied" : "Copy"}
          </span>
        </button>
        <button type="button" onClick={leave} className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-danger">
          <LogOut size={12} /> Leave
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <span
            key={m.id}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
              m.id === me?.id ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-foreground",
              m.role === "spectator" && "opacity-70",
            )}
          >
            {m.id === hostId && <Crown size={10} className="text-warning" />}
            {m.role === "spectator" ? <Eye size={10} /> : m.cube ? <Bluetooth size={10} /> : null}
            {m.name}
          </span>
        ))}
      </div>

      {!live && me && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>You&apos;re</span>
          <button
            type="button"
            onClick={() => setRole(me.role === "racer" ? "spectator" : "racer")}
            className="rounded-full bg-bg-panel-2 px-2.5 py-1 font-semibold text-foreground"
          >
            {me.role === "racer" ? "racing" : "spectating"} — switch
          </button>
        </div>
      )}

      {isHost && !live && (
        <div className="card flex flex-col gap-2 rounded-xl p-3">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
            <Crown size={10} className="text-warning" /> You&apos;re hosting
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1 text-xs">
            {(
              [
                ["ffa", "Free-for-all"],
                ["bracket", "Bracket"],
              ] as [RoomMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => hostSetMode(id)}
                className={cn("rounded-full py-1.5 font-semibold", state.mode === id ? "bg-accent text-accent-fg" : "text-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={starting || racers.length === 0 || (state.mode === "bracket" && racers.length < 2 && !upcoming)}
            onClick={() => void start()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg disabled:opacity-40"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {state.mode === "bracket"
              ? upcoming
                ? `Next heat: ${nameOf(upcoming.a!)} vs ${nameOf(upcoming.b!)}`
                : champ
                  ? `New bracket (${racers.length} racers)`
                  : `Start bracket (${racers.length} racers)`
              : `Start round ${(round?.n ?? 0) + 1} (${racers.length} racer${racers.length === 1 ? "" : "s"})`}
          </button>
          {(state.history.length > 0 || state.bracket) && (
            <button type="button" onClick={hostResetBracket} className="flex items-center justify-center gap-1 text-[11px] text-muted-2 hover:text-foreground">
              <RotateCcw size={11} /> Reset scores
            </button>
          )}
        </div>
      )}
      {!isHost && !live && <p className="text-center text-[11px] text-muted-2">Waiting for the host to start the next round…</p>}

      {round && (
        <div className="card flex flex-col gap-3 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              {round.matchId ? `Heat · ${round.racers.map(nameOf).join(" vs ")}` : `Round ${round.n}`}
            </p>
            {live && now < round.startAt && (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-fg">
                {Math.max(1, Math.ceil((round.startAt - now) / 1000))}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-muted">{round.scramble}</p>
          {live && inHeat && (
            <>
              <ScrambleNet scramble={round.scramble} className="mx-auto w-40" />
              <MyHeat key={round.n} round={round} />
            </>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {round.racers
              .filter((id) => id !== me?.id || !live)
              .map((id) => (
                <RacerTile key={`${round.n}-${id}`} id={id} round={round} />
              ))}
          </div>
          {isHost && live && (
            <button type="button" onClick={hostEndRound} className="self-center text-[11px] font-medium text-muted-2 hover:text-foreground">
              End round now (unfinished = DNF)
            </button>
          )}
          {lastPlacings && (
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              {lastPlacings.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <span className={cn("w-5 font-bold", p.place === 1 && p.timeMs !== null ? "text-warning" : "text-muted-2")}>{p.place}</span>
                  <span className="flex-1 truncate text-foreground">{nameOf(p.id)}</span>
                  <span className="tabular-timer font-semibold">{p.timeMs === null ? "DNF" : formatTime(p.timeMs)}</span>
                  {!round.matchId && <span className="w-10 text-right text-[10px] text-muted">+{p.points}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {state.mode === "bracket" && state.bracket && (
        <div className="card flex flex-col gap-2 rounded-xl p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Trophy size={13} className="text-warning" /> {champ ? `${nameOf(champ)} wins the bracket` : "Bracket"}
          </p>
          <BracketView bracket={state.bracket} names={state.names} />
        </div>
      )}

      {state.mode === "ffa" && table.length > 0 && (
        <div className="card flex flex-col gap-1 rounded-xl p-3">
          <div className="flex justify-between px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
            <span>Standings · {state.history.length} round{state.history.length === 1 ? "" : "s"}</span>
            <span>pts · wins · best · mean</span>
          </div>
          {table.map((s, i) => (
            <div key={s.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", i === 0 ? "bg-accent-soft" : "bg-bg-panel-2")}>
              <span className="w-4 font-bold text-muted-2">{i + 1}</span>
              <span className="flex-1 truncate font-semibold text-foreground">{nameOf(s.id)}</span>
              <span className="tabular-nums text-[11px] text-muted">
                <span className="font-bold text-foreground">{s.points}</span> · {s.wins} · {s.best === null ? "—" : formatTime(s.best)} ·{" "}
                {s.mean === null ? "—" : formatTime(s.mean)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-[10px] text-muted-2">
        Clocks start on a shared {COUNTDOWN_MS / 1000}s countdown. Rooms are live only — nothing is saved once everyone leaves.
      </p>
    </div>
  );
}

/** Multiplayer race rooms: N racers + spectators, free-for-all or bracket. */
export function RoomRace() {
  const status = useRoomStore((s) => s.status);
  useEffect(() => () => useRoomStore.getState().leave(), []);
  return (
    <div className="card w-full max-w-xl rounded-xl p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Users size={15} className="text-accent" /> Race room
      </h2>
      {status === "idle" || status === "error" ? <Lobby /> : <LiveRoom />}
    </div>
  );
}
