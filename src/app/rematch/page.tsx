"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ghost as GhostIcon, Link2, Loader2, Radio, RotateCcw, Swords, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { TurnChips } from "@/components/smartcube/TurnChip";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { compareSolves, type Comparison } from "@/lib/rematch/compare";
import { ghostFromShared, ghostFromSolve, ghostFromText, ghostMilestones, ghostTurnsAt, raceGap, sharedIdFrom, type Ghost } from "@/lib/rematch/ghost";
import { MILESTONES, milestoneTimes } from "@/lib/pacer/pacer";
import { fetchSharedSolve } from "@/lib/social/shareSolve";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

type Phase = "pick" | "setup" | "ready" | "solving" | "done";

const signed = (ms: number | null) => (ms === null ? "—" : `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(2)}`);

function Result({ c, ghost }: { c: Comparison; ghost: Ghost }) {
  const faster = c.totalB < c.totalA;
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-1 rounded-xl p-4 text-center">
        <p className={cn("text-sm font-semibold", faster ? "text-success" : "text-foreground")}>{c.verdict}</p>
        <div className="mt-1 grid w-full grid-cols-2 gap-2">
          {(
            [
              [ghost.source === "mine" ? "Original" : "Ghost", c.totalA, c.turnsA, ghost.date ? new Date(ghost.date).toLocaleDateString() : ghost.label],
              ["You", c.totalB, c.turnsB, "just now"],
            ] as const
          ).map(([label, ms, turns, when]) => (
            <div key={label} className={cn("rounded-lg px-2 py-2", label === "You" && faster ? "bg-success/15" : "bg-bg-panel-2")}>
              <p className="truncate text-[10px] text-muted-2">
                {label} · {when}
              </p>
              <p className="tabular-timer text-2xl font-bold text-foreground">{formatTime(ms)}</p>
              <p className="text-[10px] text-muted">
                {turns} turns · {((turns / Math.max(1, ms)) * 1000).toFixed(2)} TPS
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-2 rounded-xl p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Stretch by stretch</p>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px]">
          <span className="text-muted-2" />
          <span className="text-right text-muted-2">before</span>
          <span className="text-right text-muted-2">now</span>
          <span className="text-right text-muted-2">Δ</span>
          {c.stretches.map((r) => (
            <div key={r.label} className="contents">
              <span className="text-foreground">{r.label}</span>
              <span className="text-right tabular-nums text-muted">{r.a === null ? "—" : formatTime(r.a)}</span>
              <span className="text-right tabular-nums text-muted">{r.b === null ? "—" : formatTime(r.b)}</span>
              <span
                className={cn(
                  "text-right font-semibold tabular-nums",
                  r.delta === null ? "text-muted-2" : r.delta < -100 ? "text-success" : r.delta > 100 ? "text-danger" : "text-muted",
                )}
              >
                {signed(r.delta)}
              </span>
            </div>
          ))}
        </div>
        {c.notes.map((n) => (
          <p key={n} className="text-[11px] text-muted">
            {n}
          </p>
        ))}
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Cross before ({c.crossA.length})</p>
          <TurnChips moves={c.crossA} />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Cross now ({c.crossB.length})</p>
          <TurnChips moves={c.crossB} />
        </div>
        {(c.orderA.length > 0 || c.orderB.length > 0) && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {(
              [
                ["Pair order before", c.orderA],
                ["Pair order now", c.orderB],
              ] as const
            ).map(([label, order]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-lg bg-bg-panel-2 px-2.5 py-2">
                <span className="text-[10px] text-muted-2">{label}</span>
                {order.map((p, i) => (
                  <span key={i} className="text-foreground">
                    {i + 1}. {p}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The ghost alongside you, live: its cube at its real pace, milestone lanes for both of you, and the gap. */
function GhostPanel({ ghost, elapsed, mine }: { ghost: Ghost; elapsed: number; mine: (number | null)[] }) {
  const turns = ghostTurnsAt(ghost, elapsed);
  const moves = useMemo(() => ghost.moves.slice(0, turns).map((token, i) => ({ token, timeStampMs: ghost.timesMs[i] })), [ghost, turns]);
  const ghostTimes = useMemo(() => ghostMilestones(ghost), [ghost]);
  const gap = raceGap(ghostTimes, mine, elapsed);
  const lane = (n: number, tone: string) => (
    <div className="flex gap-0.5">
      {MILESTONES.map((m, i) => (
        <div key={m} className={cn("h-1.5 flex-1 rounded-full", i < n ? tone : "bg-bg-panel-2")} />
      ))}
    </div>
  );
  return (
    <div className="card flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-bg-panel-2">
          <LiveCubeMimic scramble={ghost.scramble} moves={moves} className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-foreground">
            <GhostIcon size={12} className="text-accent" /> {ghost.label}
          </p>
          <p className="text-[10px] text-muted-2">
            {turns >= ghost.moves.length ? `finished in ${formatTime(ghost.totalMs)}` : `${MILESTONES[gap.ghost] ?? "Solved"} next · turn ${turns}/${ghost.moves.length}`}
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wide text-muted-2">Ghost</span>
            {lane(gap.ghost, "bg-muted-2")}
            <span className="text-[9px] uppercase tracking-wide text-muted-2">You</span>
            {lane(gap.mine, "bg-accent")}
          </div>
        </div>
      </div>
      <p className={cn("text-center text-xs font-semibold", gap.deltaMs !== null && gap.deltaMs < 0 ? "text-success" : gap.deltaMs !== null && gap.deltaMs > 50 ? "text-danger" : "text-muted")}>
        {gap.line}
      </p>
    </div>
  );
}

/** Where the ghost comes from: one of your solves, a friend's shared link, or any pasted reconstruction. */
function GhostPicker({ onPick }: { onPick: (g: Ghost) => void }) {
  const allSolves = useSessionStore((s) => s.allSolves);
  const candidates = useMemo(
    () =>
      allSolves
        .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0 && s.penalty !== "dnf")
        .sort((a, b) => b.date - a.date)
        .slice(0, 40),
    [allSolves],
  );
  const [source, setSource] = useState<"mine" | "shared" | "pasted">("mine");
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadShared = async () => {
    const id = sharedIdFrom(link);
    if (!id) return setError("That doesn't look like a shared solve link.");
    setLoading(true);
    setError(null);
    const sh = await fetchSharedSolve(id);
    setLoading(false);
    if (!sh) return setError("Couldn't find that shared solve.");
    const g = ghostFromShared(sh);
    if ("error" in g) setError(g.error);
    else onPick(g);
  };
  const loadPasted = () => {
    const g = ghostFromText(text, Number(time));
    if ("error" in g) setError(g.error);
    else onPick(g);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-bg-panel-2 p-1 text-[11px]">
        {(
          [
            ["mine", "My solves"],
            ["shared", "Friend's link"],
            ["pasted", "Paste a recon"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSource(id);
              setError(null);
            }}
            className={cn("rounded-full py-1.5 font-semibold", source === id ? "bg-accent text-accent-fg" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {source === "mine" &&
        (candidates.length === 0 ? (
          <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on your smart cube first — every solve you finish can be raced here.</div>
        ) : (
          <div className="card flex flex-col gap-1 rounded-xl p-2">
            {candidates.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(ghostFromSolve(s))}
                className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-bg-panel-2"
              >
                <span className="flex flex-col">
                  <span className="tabular-timer text-sm font-semibold text-foreground">{formatTime(s.timeMs)}</span>
                  <span className="text-[10px] text-muted-2">
                    {new Date(s.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
                    {s.reconstruction!.split(/\s+/).length} turns
                  </span>
                </span>
                <Swords size={14} className="text-muted-2" />
              </button>
            ))}
          </div>
        ))}
      {source === "shared" && (
        <div className="card flex flex-col gap-2 rounded-xl p-3">
          <p className="text-[11px] text-muted">Paste a shared solve link (from Share on any solve). You race their real turns at their real pace.</p>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…/solve/…"
              className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-2"
            />
            <button type="button" onClick={() => void loadShared()} disabled={loading || !link.trim()} className="flex items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-40">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Load
            </button>
          </div>
        </div>
      )}
      {source === "pasted" && (
        <div className="card flex flex-col gap-2 rounded-xl p-3">
          <p className="text-[11px] text-muted">
            Scramble on the first line, the solution below (rotations fine, from white top / green front), and the time. With no per-turn timing the ghost
            turns at an even pace.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"R' U' F D2 L2 F R2 U2 …\nz2 // inspection\nD' R' D …"}
            className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-2"
          />
          <div className="flex gap-2">
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              inputMode="decimal"
              placeholder="Time, e.g. 9.42"
              className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-2"
            />
            <button type="button" onClick={loadPasted} disabled={!text.trim() || !time.trim()} className="rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-40">
              Race it
            </button>
          </div>
        </div>
      )}
      {error && <p className="px-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * Solve Rematch / Ghost Race: pick a ghost — any past solve of yours, a
 * friend's shared solve, or a pasted reconstruction — the app puts that
 * exact scramble on your cube, and you race it: the ghost's real turns
 * play at their real pace beside you, milestone by milestone. Afterwards,
 * stretch by stretch and path by path, how you compare.
 */
function Rematch() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [mine, setMine] = useState<(number | null)[]>(MILESTONES.map(() => null));
  const phaseRef = useRef<Phase>("pick");
  const ghostRef = useRef<Ghost | null>(null);
  const movesRef = useRef<{ token: string; at: number }[]>([]);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => setP("ready"), []);
  const { route, begin, stop } = useCubeSetup(onReady);

  const pick = useCallback(
    (g: Ghost) => {
      ghostRef.current = g;
      setGhost(g);
      setComparison(null);
      setMine(MILESTONES.map(() => null));
      movesRef.current = [];
      setP("setup");
      begin(g.scramble);
    },
    [begin],
  );

  // A ?ghost=<shared id> link (from a shared solve's "Race this ghost") loads straight in.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("ghost");
    if (!id) return;
    let cancelled = false;
    void fetchSharedSolve(id).then((sh) => {
      if (cancelled || !sh) return;
      const g = ghostFromShared(sh);
      if (!("error" in g)) pick(g);
    });
    return () => {
      cancelled = true;
    };
  }, [pick]);

  const finish = useCallback(() => {
    const g = ghostRef.current;
    if (!g) return;
    const first = movesRef.current[0]?.at ?? 0;
    const c = compareSolves(
      g.scramble,
      { moves: g.moves, timesMs: g.timesMs, totalMs: g.totalMs },
      { moves: movesRef.current.map((m) => m.token), timesMs: movesRef.current.map((m) => m.at - first) },
    );
    setComparison(c);
    setP("done");
  }, []);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current === "ready") setP("solving");
      if (phaseRef.current !== "solving") return;
      movesRef.current.push({ token: m.token, at: m.timeStampMs });
      const g = ghostRef.current;
      if (g) {
        const first = movesRef.current[0].at;
        setMine(milestoneTimes({ scramble: g.scramble, moves: movesRef.current.map((x) => x.token), timesMs: movesRef.current.map((x) => x.at - first) }));
      }
      window.setTimeout(() => {
        if (phaseRef.current === "solving" && useSmartCubeStore.getState().liveFacelets === SOLVED_FACELETS) finish();
      }, 0);
    });
  }, [finish]);

  useEffect(() => {
    if (phase !== "solving") return;
    let raf = 0;
    const tick = () => {
      const first = movesRef.current[0]?.at;
      if (first !== undefined) setElapsed(performance.now() - first);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase === "pick") return <GhostPicker onPick={pick} />;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          stop();
          setP("pick");
        }}
        className="flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft size={13} /> Pick another ghost
      </button>

      {ghost && phase !== "done" && phase !== "solving" && (
        <div className="card flex items-center justify-between gap-3 rounded-xl px-4 py-3">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted">
            <GhostIcon size={12} className="shrink-0 text-accent" /> {ghost.label}
            {ghost.evenlyPaced && " · even pace"}
          </span>
          <span className="tabular-timer text-lg font-bold text-foreground">{formatTime(ghost.totalMs)}</span>
        </div>
      )}

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Put the scramble back on your cube</p>
          {route ? <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" /> : <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
      )}

      {phase === "ready" && (
        <div className="card flex flex-col items-center gap-2 rounded-xl p-6 text-center">
          <Radio size={20} className="animate-pulse text-accent" />
          <p className="text-sm font-semibold text-foreground">Same scramble. Inspect, then go.</p>
          <p className="text-[11px] text-muted">The clock — and the ghost — start on your first turn; the clock stops when your cube is solved.</p>
        </div>
      )}

      {phase === "solving" && ghost && (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="tabular-timer text-6xl font-bold text-foreground">{formatTime(elapsed)}</p>
            <p className={cn("text-xs font-medium", elapsed > ghost.totalMs ? "text-danger" : "text-muted")}>
              {elapsed > ghost.totalMs ? "the ghost has finished" : `ghost: ${formatTime(ghost.totalMs)}`}
            </p>
          </div>
          <GhostPanel ghost={ghost} elapsed={elapsed} mine={mine} />
        </>
      )}

      {phase === "done" && comparison && ghost && (
        <>
          <Result c={comparison} ghost={ghost} />
          <button
            type="button"
            onClick={() => pick(ghost)}
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg"
          >
            <RotateCcw size={14} /> Race it again
          </button>
        </>
      )}
    </div>
  );
}

export default function RematchPage() {
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Swords size={17} className="text-accent" /> Rematch &amp; Ghost Race
            </h1>
            <p className="text-[11px] text-muted-2">
              Race a real solve on the same scramble — yours, a friend&apos;s shared link, or any reconstruction — its turns playing beside you at their
              real pace.
            </p>
          </div>
          <ConnectGate blurb="The Ghost Race puts the ghost's scramble on your cube and races it turn by turn, so it needs a connected smart cube.">
            <Rematch />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
