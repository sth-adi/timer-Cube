"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, EyeOff, Loader2, Play, RotateCcw, Stethoscope, Timer as TimerIcon, XCircle } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { RouteTracker } from "@/lib/smartcube/route";
import { diagnoseBld, type BldDiagnosis, type UnsolvedPiece } from "@/lib/bld/doctor";
import { buildBldMemo, pairUp } from "@/lib/analysis/bldMemo";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

type Phase = "idle" | "loading" | "setup" | "ready" | "memo" | "exec" | "done";

interface Attempt {
  scramble: string;
  totalMs: number;
  memoMs: number;
  diagnosis: BldDiagnosis;
}

const COLOR_HEX: Record<string, string> = {
  White: "#f5f5f0",
  Yellow: "#ffd42a",
  Green: "#1fa64c",
  Blue: "#2f6bff",
  Red: "#e0332f",
  Orange: "#ff8c1a",
};

function PieceChip({ u }: { u: UnsolvedPiece }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-black/30">
        {u.piece.name.split("-").map((c) => (
          <span key={c} className="h-3.5 w-2.5" style={{ background: COLOR_HEX[c] }} />
        ))}
      </span>
      <span className="font-mono text-[11px] font-bold text-foreground">{u.piece.letter}</span>
    </span>
  );
}

function useElapsed(running: boolean, startRef: React.RefObject<number>): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now() - (startRef.current ?? 0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, startRef]);
  return now;
}

function Report({ attempt }: { attempt: Attempt }) {
  const d = attempt.diagnosis;
  const memo = useMemo(() => buildBldMemo(attempt.scramble), [attempt.scramble]);
  const maxSolved = 20;
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-2 rounded-xl p-4 text-center">
        {d.solved ? <CheckCircle2 size={30} className="text-success" /> : <XCircle size={30} className="text-danger" />}
        <p className={cn("tabular-timer text-4xl font-bold", d.solved ? "text-success" : "text-danger")}>
          {d.solved ? formatTime(attempt.totalMs) : "DNF"}
        </p>
        <p className="text-xs text-muted">
          {formatTime(attempt.totalMs)} total · memo {formatTime(attempt.memoMs)} · execution {formatTime(attempt.totalMs - attempt.memoMs)}
        </p>
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Stethoscope size={15} className="text-accent" /> {d.verdict}
        </p>
        <p className="text-[11px] text-muted">{d.detail}</p>

        {d.chunks.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Pieces solved after each chunk</p>
            <div className="flex h-16 items-end gap-[3px]">
              {d.chunks.map((c, i) => (
                <div
                  key={i}
                  title={`Chunk ${i + 1}: ${c.solvedAfter}/20 solved`}
                  className={cn("flex-1 rounded-t-sm", i === d.firstBadChunk ? "bg-danger" : "bg-accent/70")}
                  style={{ height: `${Math.max(6, (c.solvedAfter / maxSolved) * 100)}%` }}
                />
              ))}
            </div>
            {d.firstBadChunk !== null && (
              <p className="text-[11px] text-danger">
                Went wrong in chunk {d.firstBadChunk + 1} of {d.chunks.length}, at {formatTime(d.chunks[d.firstBadChunk].startMs)} into
                execution.
              </p>
            )}
          </div>
        )}

        {d.unsolved.some((u) => u.brokenInChunk !== null) && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Solved at some point, then broken</p>
            {d.unsolved
              .filter((u) => u.brokenInChunk !== null)
              .sort((a, b) => a.brokenInChunk! - b.brokenInChunk!)
              .map((u) => (
                <div key={`${u.piece.kind}${u.piece.index}`} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-2.5 py-1.5">
                  <span className="flex items-center gap-2">
                    <PieceChip u={u} />
                    <span className="text-[10px] text-muted-2">{u.piece.kind}</span>
                  </span>
                  <span className="text-[10px] text-muted">
                    {u.issue} · broken in chunk {u.brokenInChunk! + 1}
                  </span>
                </div>
              ))}
          </div>
        )}

        {(["corner", "edge"] as const).map((kind) => {
          const never = d.unsolved.filter((u) => u.brokenInChunk === null && u.piece.kind === kind);
          if (never.length === 0) return null;
          return (
            <div key={kind} className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                {kind === "corner" ? "Corners" : "Edges"} never solved during the attempt — a skipped target or memo slip
              </p>
              <div className="flex flex-wrap gap-2">
                {never.map((u) => (
                  <span key={u.piece.index} className="rounded-lg bg-bg-panel-2 px-2 py-1" title={`${u.piece.name} — ${u.issue}`}>
                    <PieceChip u={u} />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card flex flex-col gap-1.5 rounded-xl p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Correct memo (Speffz, buffer A: ULB corner / UB edge)</p>
        <p className="font-mono text-xs text-foreground">
          <span className="text-muted-2">Edges </span>
          {memo.edgesSolved ? "—" : pairUp(memo.edgeWords.flat()).join(" ")}
        </p>
        <p className="font-mono text-xs text-foreground">
          <span className="text-muted-2">Corners </span>
          {memo.cornersSolved ? "—" : pairUp(memo.cornerWords.flat()).join(" ")}
        </p>
        <p className="break-words font-mono text-[10px] text-muted-2">{attempt.scramble}</p>
      </div>
    </div>
  );
}

/**
 * BLD Doctor: blindfolded solving on a smart cube. The app sets up a
 * random-state scramble on your cube (tracking every setup turn), blacks
 * the screen out while you memo and execute, stops itself the instant the
 * cube is solved — and if it isn't, tells you exactly what went wrong and
 * in which chunk of your execution.
 */
function BldDoctor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scramble, setScramble] = useState("");
  const [route, setRoute] = useState<{ turns: string[]; position: number; partial: boolean } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const trackerRef = useRef<RouteTracker | null>(null);
  const targetRef = useRef("");
  const startRef = useRef(0);
  const firstMoveRef = useRef<number | null>(null);
  const movesRef = useRef<{ token: string; at: number }[]>([]);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const elapsed = useElapsed(phase === "memo" || phase === "exec", startRef);

  const planSetup = useCallback((target: string) => {
    const live = useSmartCubeStore.getState().liveFacelets;
    if (live === scrambleToFacelets(target)) {
      trackerRef.current = null;
      setRoute(null);
      setP("ready");
      return;
    }
    // From a solved cube the setup is simply the sequence itself — shorter
    // and more natural than a solver route between two arbitrary states.
    if (live === SOLVED_FACELETS) {
      const turns = target.split(/\s+/).filter(Boolean);
      trackerRef.current = new RouteTracker(turns);
      setRoute({ turns, position: 0, partial: false });
      return;
    }
    getCubeEngineClient()
      .computeCorrectiveMoves(target, live)
      .then((turns) => {
        if (targetRef.current !== target || phaseRef.current !== "setup") return;
        trackerRef.current = new RouteTracker(turns);
        setRoute({ turns, position: 0, partial: false });
      })
      .catch(() => setRoute(null));
  }, []);

  const newAttempt = async () => {
    setP("loading");
    const s = await getCubeEngineClient().generateScramble();
    setScramble(s);
    targetRef.current = s;
    setP("setup");
    planSetup(s);
  };

  const finish = useCallback((stopAt: number) => {
    const moves = movesRef.current;
    const first = firstMoveRef.current ?? stopAt;
    const diagnosis = diagnoseBld(
      targetRef.current,
      moves.map((m) => m.token),
      moves.map((m) => m.at - first),
    );
    setAttempts((a) => [{ scramble: targetRef.current, totalMs: stopAt - startRef.current, memoMs: first - startRef.current, diagnosis }, ...a]);
    setP("done");
  }, []);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      const p = phaseRef.current;
      if (p === "setup") {
        const tracker = trackerRef.current;
        const event = tracker?.push(m.token);
        window.setTimeout(() => {
          if (phaseRef.current !== "setup") return;
          if (useSmartCubeStore.getState().liveFacelets === scrambleToFacelets(targetRef.current)) {
            trackerRef.current = null;
            setRoute(null);
            setP("ready");
          } else if (!tracker || event === "off-route") {
            planSetup(targetRef.current);
          } else {
            setRoute((r) => (r ? { ...r, position: tracker.position, partial: tracker.partial } : r));
          }
        }, 0);
        return;
      }
      if (p === "memo" || p === "exec") {
        if (p === "memo") {
          firstMoveRef.current = m.timeStampMs;
          setP("exec");
        }
        movesRef.current.push({ token: m.token, at: m.timeStampMs });
        window.setTimeout(() => {
          if (phaseRef.current === "exec" && useSmartCubeStore.getState().liveFacelets === SOLVED_FACELETS) finish(m.timeStampMs);
        }, 0);
      }
    });
  }, [planSetup, finish]);

  const start = () => {
    movesRef.current = [];
    firstMoveRef.current = null;
    startRef.current = performance.now();
    setP("memo");
  };

  const successes = attempts.filter((a) => a.diagnosis.solved).length;

  if (phase === "memo" || phase === "exec") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black">
        <p className="flex items-center gap-2 text-sm font-medium text-white/40">
          <EyeOff size={16} /> {phase === "memo" ? "Memo — first turn starts execution" : "Executing"}
        </p>
        <p className="tabular-timer text-7xl font-bold text-white/90">{formatTime(elapsed)}</p>
        <button
          type="button"
          onClick={() => finish(performance.now())}
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/70"
        >
          I&apos;m done
        </button>
        <p className="max-w-xs text-center text-[11px] text-white/30">Stops by itself the moment the cube is solved.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {attempts.length > 0 && (
        <p className="px-1 text-[11px] text-muted-2">
          This session: {successes}/{attempts.length} successes
        </p>
      )}

      {phase === "done" && attempts[0] && <Report attempt={attempts[0]} />}

      {(phase === "idle" || phase === "done") && (
        <button
          type="button"
          onClick={() => void newAttempt()}
          className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg"
        >
          {phase === "done" ? <RotateCcw size={14} /> : <Play size={14} />} {phase === "done" ? "Next attempt" : "Start a BLD attempt"}
        </button>
      )}

      {phase === "loading" && (
        <div className="card flex items-center justify-center gap-2 rounded-xl p-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin text-accent" /> Generating a random-state scramble…
        </div>
      )}

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Scramble your cube</p>
          <p className="max-w-xs text-[11px] text-muted">Follow the turns — no need to hold it any particular way. Don&apos;t look at the result once it&apos;s scrambled if you want a fair attempt.</p>
          {route ? (
            <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" />
          ) : (
            <Loader2 size={16} className="animate-spin text-accent" />
          )}
          <p className="break-words font-mono text-[10px] text-muted-2">{scramble}</p>
        </div>
      )}

      {phase === "ready" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Scrambled. Ready when you are.</p>
          <p className="max-w-xs text-[11px] text-muted">Tap start as you begin memorizing. The screen goes dark; your first turn marks the switch to execution.</p>
          <button type="button" onClick={start} className="flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg">
            <EyeOff size={14} /> Start memo
          </button>
        </div>
      )}
    </div>
  );
}

export default function BldPage() {
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
              <Stethoscope size={17} className="text-accent" /> BLD Doctor
            </h1>
            <p className="text-[11px] text-muted-2">Blindfolded attempts on your smart cube — and when one DNFs, exactly why.</p>
          </div>
          <ConnectGate blurb="BLD Doctor sets up the scramble on your cube and watches every turn of the attempt, so it needs a connected smart cube.">
            <BldDoctor />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
