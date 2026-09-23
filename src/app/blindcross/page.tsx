"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, EyeClosed, Flame, Loader2, Play, RotateCcw, Timer as TimerIcon, XCircle } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { TurnChip } from "@/components/smartcube/TurnChip";
import { CountdownRing } from "@/components/smartcube/CountdownRing";
import { GazeCard } from "@/components/gaze/GazeCard";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeGyro, subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { useBlindCrossStore } from "@/lib/store/blindCrossStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { Cube } from "@/lib/cube-engine/engine";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { gradeBlindCross, isBlindTargetDone, summarizeBlind, type BlindCrossResult, type BlindLevel } from "@/lib/blindcross/grade";
import { analyzeGaze, type GazeReport } from "@/lib/gaze/gaze";
import type { GyroSample } from "@/lib/gyro/orientation";
import { cn } from "@/lib/utils/cn";

type Phase = "idle" | "loading" | "setup" | "inspect" | "blind" | "done";

const INSPECTION_MS = 15000;
/** A pause this long with eyes closed means "I think I'm done". */
const STOP_PAUSE_MS = 3000;

interface Attempt {
  scramble: string;
  result: BlindCrossResult;
  inspectMs: number;
  gaze: GazeReport | null;
}

/** Eyes are closed — the result has to be heard. */
function useBeeper() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    if (!ctxRef.current && typeof AudioContext !== "undefined") ctxRef.current = new AudioContext();
    void ctxRef.current?.resume();
  }, []);
  const beep = useCallback((freqs: number[]) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    freqs.forEach((f, i) => {
      const when = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.35, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.12);
    });
  }, []);
  return { unlock, beep };
}

/** Cross distance after every turn — a staircase that should only ever step down. */
function Trail({ result }: { result: BlindCrossResult }) {
  const { trail, wanderedAt } = result;
  const w = 280;
  const h = 56;
  const max = Math.max(1, ...trail);
  const x = (i: number) => (trail.length === 1 ? w / 2 : (i / (trail.length - 1)) * (w - 8) + 4);
  const y = (d: number) => 6 + (1 - d / max) * (h - 12);
  const path = trail.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d)}`).join(" ");
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Turns from a finished cross, after each turn</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={4} x2={w - 4} y1={y(0)} y2={y(0)} stroke="var(--success)" strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {trail.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d)} r={wanderedAt !== null && i === wanderedAt + 1 ? 4 : 2.5} fill={wanderedAt !== null && i === wanderedAt + 1 ? "var(--danger)" : "var(--accent)"} />
        ))}
      </svg>
    </div>
  );
}

function Report({ attempt }: { attempt: Attempt }) {
  const r = attempt.result;
  const optimal = useMemo(() => solveCrossOptimal(attempt.scramble), [attempt.scramble]);
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-2 rounded-xl p-4 text-center">
        {r.success ? <CheckCircle2 size={30} className="text-success" /> : <XCircle size={30} className="text-danger" />}
        <p className={cn("text-sm font-semibold", r.success ? "text-success" : "text-danger")}>{r.verdict}</p>
        <p className="text-[11px] text-muted">{r.detail}</p>
        <div className="mt-1 grid w-full grid-cols-3 gap-2">
          {[
            [`${r.turns}`, "your turns"],
            [`${r.optimal}`, "optimal cross"],
            [`${(attempt.inspectMs / 1000).toFixed(1)}s`, "inspection"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-bg-panel-2 px-2 py-1.5">
              <p className="text-base font-bold tabular-nums text-foreground">{v}</p>
              <p className="text-[10px] text-muted-2">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <Trail result={r} />
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What you did</p>
          <div className="flex flex-wrap gap-1">
            {r.moves.length === 0 ? <span className="text-[11px] text-muted">No turns.</span> : r.moves.map((t, i) => <TurnChip key={i} token={t} bad={i === r.wanderedAt} />)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">An optimal cross ({optimal.length})</p>
          <div className="flex flex-wrap gap-1">
            {optimal.map((t, i) => (
              <TurnChip key={i} token={t} />
            ))}
          </div>
          <p className="text-[10px] text-muted-2">Each chip is the center that turns: ↻ clockwise facing that center, ↺ counter-clockwise.</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {r.edges.map((e) => (
            <div key={e.name} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-2.5 py-1.5">
              <span className="text-[11px] text-foreground">{e.name}</span>
              <span className={cn("text-[10px] font-semibold", e.status === "solved" ? "text-success" : "text-danger")}>{e.status}</span>
            </div>
          ))}
        </div>
      </div>

      {attempt.gaze && <GazeCard report={attempt.gaze} facelets={scrambleToFacelets(attempt.scramble)} />}
    </div>
  );
}

/**
 * Blind Cross: inspect, close your eyes, solve the cross — the classic
 * lookahead drill, finally graded. The app sets the scramble up on the cube,
 * listens to every turn you make with your eyes shut, beeps when you're
 * done, and shows exactly where the plan in your head left the optimal path.
 */
function BlindCross() {
  const level = useBlindCrossStore((s) => s.level);
  const setLevel = useBlindCrossStore((s) => s.setLevel);
  const history = useBlindCrossStore((s) => s.attempts);
  const record = useBlindCrossStore((s) => s.record);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [now, setNow] = useState(0);
  // Mirrors of the timing refs for rendering (refs can't be read during render).
  const [inspectStart, setInspectStart] = useState(0);
  const [blindStart, setBlindStart] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  const scrambleRef = useRef("");
  const levelRef = useRef<BlindLevel>(level);
  const inspectStartRef = useRef(0);
  const blindStartRef = useRef(0);
  const lastMoveRef = useRef(0);
  const movesRef = useRef<string[]>([]);
  const gyroRef = useRef<GyroSample[]>([]);
  const { unlock, beep } = useBeeper();
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => {
    inspectStartRef.current = performance.now();
    setInspectStart(inspectStartRef.current);
    setNow(inspectStartRef.current);
    gyroRef.current = [];
    beep([880]);
    setP("inspect");
  }, [beep]);
  const { route, begin } = useCubeSetup(onReady);

  const goBlind = useCallback((atMs: number) => {
    if (phaseRef.current !== "inspect") return;
    blindStartRef.current = atMs;
    setBlindStart(atMs);
    lastMoveRef.current = atMs;
    setP("blind");
  }, []);

  const finish = useCallback(() => {
    if (phaseRef.current !== "blind") return;
    const scramble = scrambleRef.current;
    const result = gradeBlindCross(scramble, movesRef.current, levelRef.current);
    const inspectMs = blindStartRef.current - inspectStartRef.current;
    const ref = useGyroStore.getState().ref;
    const gaze = ref
      ? analyzeGaze(
          gyroRef.current,
          ref,
          calibrationFor(useSmartCubeStore.getState().protocolName).calibration,
          inspectStartRef.current,
          blindStartRef.current,
          scrambleToFacelets(scramble),
        )
      : null;
    beep(result.success ? [660, 990] : [330, 220]);
    record({ date: Date.now(), level: levelRef.current, success: result.success, turns: result.turns, optimal: result.optimal, inspectMs });
    setAttempt({ scramble, result, inspectMs, gaze });
    setP("done");
  }, [beep, record]);

  const start = async () => {
    unlock();
    levelRef.current = level;
    movesRef.current = [];
    setP("loading");
    const s = await getCubeEngineClient().generateScramble();
    scrambleRef.current = s;
    setP("setup");
    begin(s);
  };

  // Turns: the first one during inspection is the moment your eyes closed.
  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current === "inspect") goBlind(m.timeStampMs);
      if (phaseRef.current !== "blind") return;
      movesRef.current.push(m.token);
      lastMoveRef.current = m.timeStampMs;
      window.setTimeout(() => {
        if (phaseRef.current !== "blind") return;
        if (isBlindTargetDone(levelRef.current, Cube.fromString(useSmartCubeStore.getState().liveFacelets))) finish();
      }, 0);
    });
  }, [goBlind, finish]);

  useEffect(() => {
    return subscribeGyro((g) => {
      if (phaseRef.current === "inspect" && gyroRef.current.length < 5000) gyroRef.current.push(g);
    });
  }, []);

  // Clock for the inspection countdown, the 15s cutoff and the "stopped turning" detector.
  useEffect(() => {
    if (phase !== "inspect" && phase !== "blind") return;
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (phaseRef.current === "inspect" && t - inspectStartRef.current >= INSPECTION_MS) {
        beep([440, 440]);
        goBlind(t);
      } else if (phaseRef.current === "blind" && movesRef.current.length > 0 && t - lastMoveRef.current >= STOP_PAUSE_MS) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, goBlind, finish, beep]);

  const summary = useMemo(() => summarizeBlind(history, level), [history, level]);

  if (phase === "blind") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black">
        <EyeClosed size={40} className="text-white/30" />
        <p className="text-sm font-medium text-white/50">Eyes closed — solve the {level === "xcross" ? "x-cross" : "cross"}</p>
        <p className="tabular-timer text-5xl font-bold text-white/80">{Math.max(0, (now - blindStart) / 1000).toFixed(1)}</p>
        <button type="button" onClick={finish} className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/70">
          Done
        </button>
        <p className="max-w-xs text-center text-[11px] text-white/30">Beeps when the {level === "xcross" ? "x-cross" : "cross"} is solved, or once you stop turning for 3 seconds.</p>
      </div>
    );
  }

  const remaining = Math.max(0, INSPECTION_MS - (now - inspectStart));

  return (
    <div className="flex flex-col gap-3">
      {(phase === "idle" || phase === "done") && (
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex rounded-full bg-bg-panel-2 p-1">
            {(["cross", "xcross"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold", level === l ? "bg-accent text-accent-fg" : "text-muted")}
              >
                {l === "cross" ? "Cross" : "X-Cross (cross + a pair)"}
              </button>
            ))}
          </div>
          {summary ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-bg-panel-2 py-1.5">
                <p className="text-base font-bold tabular-nums text-foreground">{Math.round(summary.successRate * 100)}%</p>
                <p className="text-[10px] text-muted-2">success · {summary.attempts} {summary.attempts === 1 ? "try" : "tries"}</p>
              </div>
              <div className="rounded-lg bg-bg-panel-2 py-1.5">
                <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums text-foreground">
                  <Flame size={13} className={summary.streak > 0 ? "text-warning" : "text-muted-2"} /> {summary.streak}
                </p>
                <p className="text-[10px] text-muted-2">streak · best {summary.bestStreak}</p>
              </div>
              <div className="rounded-lg bg-bg-panel-2 py-1.5">
                <p className="text-base font-bold tabular-nums text-foreground">{summary.avgExtra !== null ? `+${summary.avgExtra.toFixed(1)}` : "—"}</p>
                <p className="text-[10px] text-muted-2">turns over optimal</p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted">
              The app scrambles your cube, you get 15 seconds to inspect, then you close your eyes and solve the {level === "xcross" ? "cross and one F2L pair" : "cross"}. Your
              first turn marks the moment your eyes closed.
            </p>
          )}
          {level === "cross" && summary && summary.attempts >= 10 && summary.recentRate >= 0.8 && (
            <p className="text-[11px] font-medium text-success">8+ of your last 10 blind crosses worked — time to try X-Cross.</p>
          )}
          <button
            type="button"
            onClick={() => void start()}
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg"
          >
            {phase === "done" ? <RotateCcw size={14} /> : <Play size={14} />} {phase === "done" ? "Next scramble" : "Start"}
          </button>
          {gyroActive && <p className="text-center text-[10px] text-muted-2">Gyro on — your inspection gaze will be mapped too.</p>}
        </div>
      )}

      {phase === "done" && attempt && <Report attempt={attempt} />}

      {phase === "loading" && (
        <div className="card flex items-center justify-center gap-2 rounded-xl p-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin text-accent" /> Generating a scramble…
        </div>
      )}

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Scramble your cube</p>
          <p className="max-w-xs text-[11px] text-muted">Follow the turns. Inspection starts the moment it matches.</p>
          {route ? <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" /> : <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
      )}

      {phase === "inspect" && (
        <div className="card flex flex-col items-center gap-4 rounded-xl p-6 text-center">
          <CountdownRing remainingMs={remaining} totalMs={INSPECTION_MS} />
          <p className="text-sm font-semibold text-foreground">Plan the whole {level === "xcross" ? "x-cross" : "cross"}</p>
          <p className="max-w-xs text-[11px] text-muted">When you&apos;re ready, close your eyes and start turning. No peeking until it beeps.</p>
          <button
            type="button"
            onClick={() => goBlind(performance.now())}
            className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground"
          >
            <EyeClosed size={13} /> Black out the screen first
          </button>
        </div>
      )}
    </div>
  );
}

export default function BlindCrossPage() {
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
              <EyeClosed size={17} className="text-accent" /> Blind Cross
            </h1>
            <p className="text-[11px] text-muted-2">Inspect, close your eyes, solve the cross — graded turn by turn by the cube itself.</p>
          </div>
          <ConnectGate blurb="Blind Cross sets up the scramble on your cube and follows every turn you make with your eyes closed, so it needs a connected smart cube.">
            <BlindCross />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
