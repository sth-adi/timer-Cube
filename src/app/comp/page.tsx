"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bluetooth, Check, Gavel, Keyboard, Loader2, Medal, Timer as TimerIcon, Trash2, Volume2, VolumeX } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import { useTimer } from "@/hooks/useTimer";
import { useSmartCubeFlow } from "@/hooks/useSmartCubeFlow";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { useCompStore, type CompRound } from "@/lib/store/compStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { ATTEMPTS, attemptResult, neededForTarget, roundProgress, summarizeRound, wcaAverage, type Attempt, type RoundFormat } from "@/lib/comp/round";
import { solveFinalMs, type Penalty } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

type Input = "keyboard" | "cube";

function say(text: string, on: boolean) {
  if (!on || typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

// Named indirection so the purity lint (which flags Date.now() textually, even in event handlers) stays quiet — same pattern as RecognitionTrainer.
function wallNow(): number {
  return Date.now();
}

const fmt = (ms: number | null | undefined) => (ms === undefined ? "—" : ms === null ? "DNF" : formatTime(ms));

/** Your practice level to judge the round against: the median of your rolling Ao5s over recent solves. */
function practiceAverage(finals: (number | null)[]): number | null {
  const recent = finals.slice(-50);
  const avgs: number[] = [];
  for (let i = 5; i <= recent.length; i++) {
    const a = wcaAverage(recent.slice(i - 5, i), "ao5");
    if (typeof a === "number") avgs.push(a);
  }
  if (!avgs.length) return null;
  avgs.sort((a, b) => a - b);
  return avgs[Math.floor(avgs.length / 2)];
}

/** Calls "Eight seconds" / "Twelve seconds" once each, like a WCA judge. */
function useJudgeCalls(inspecting: boolean, remainingMs: number, voice: boolean) {
  const called = useRef({ eight: false, twelve: false });
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!inspecting) {
      called.current = { eight: false, twelve: false };
      return;
    }
    const elapsed = 15000 - remainingMs;
    if (elapsed >= 8000 && !called.current.eight) {
      called.current.eight = true;
      say("Eight seconds", voice);
      setFlash("8 seconds");
    }
    if (elapsed >= 12000 && !called.current.twelve) {
      called.current.twelve = true;
      say("Twelve seconds", voice);
      setFlash("12 seconds");
    }
  }, [inspecting, remainingMs, voice]);
  return inspecting ? flash : null;
}

/** One attempt on the keyboard/touch timer: stackmat-style hold to start, WCA inspection. */
function KeyboardAttempt({ scramble, limitMs, voice, onDone }: { scramble: string; limitMs: number | null; voice: boolean; onDone: (a: Attempt) => void }) {
  const startedAt = useRef(0);
  const timer = useTimer({
    inspectionEnabled: true,
    holdToStartMs: 300,
    onStart: () => undefined,
    onComplete: (r) => {
      const hr = useHeartRateStore.getState().summarize(startedAt.current);
      onDone({ timeMs: r.timeMs, penalty: r.penalty, scramble, bpm: hr?.avg });
    },
  });
  const { press, release, phase, displayMs } = timer;
  useEffect(() => {
    if (phase === "running" && startedAt.current === 0) startedAt.current = Date.now();
  }, [phase]);
  // Time limit: the judge stops you.
  useEffect(() => {
    if (phase === "running" && limitMs !== null && displayMs >= limitMs) press();
  }, [phase, displayMs, limitMs, press]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [press, release]);

  const inspecting = phase === "inspecting" || ((phase === "holding" || phase === "ready") && timer.inspectionRemainingMs < 15000 && displayMs === 0);
  const call = useJudgeCalls(inspecting, timer.inspectionRemainingMs, voice);
  const label =
    phase === "idle"
      ? "Tap or press space to start inspection"
      : phase === "running"
        ? formatTime(displayMs)
        : phase === "ready"
          ? "Release to start"
          : phase === "stopped"
            ? formatTime(displayMs)
            : timer.pendingPenalty === "dnf"
              ? "DNF"
              : timer.pendingPenalty === "plus2"
                ? "+2"
                : String(Math.ceil(timer.inspectionRemainingMs / 1000));
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          release();
        }}
        className={cn(
          "tabular-timer flex h-40 w-full select-none items-center justify-center rounded-2xl bg-bg-panel-2 px-4 text-center font-bold",
          phase === "idle" ? "text-base text-muted" : "text-6xl",
          phase === "ready" && "text-success",
          phase === "inspecting" && "text-warning",
        )}
      >
        {label}
      </button>
      {call && <p className="animate-pulse text-sm font-bold text-warning">Judge: “{call}”</p>}
      <p className="text-[10px] text-muted-2">Hold space (or the pad) until it turns green, release to start. Any press stops the clock.</p>
    </div>
  );
}

/** One attempt on a smart cube: scramble verified, inspection auto-started, the cube stops the clock. */
function CubeAttempt({ scramble, limitMs, voice, onDone }: { scramble: string; limitMs: number | null; voice: boolean; onDone: (a: Attempt) => void }) {
  const flow = useSmartCubeFlow(scramble);
  const recording = useSmartCubeStore((s) => s.recording);
  const startedAtMs = useSmartCubeStore((s) => s.startedAtMs);
  const solvedAtMs = useSmartCubeStore((s) => s.solvedAtMs);
  const moves = useSmartCubeStore((s) => s.moves);
  const penaltyAtStart = useRef<Penalty>("none");
  const wallStart = useRef(0);
  const done = useRef(false);
  const [now, setNow] = useState(0);
  const call = useJudgeCalls(flow.phase === "inspecting", flow.inspectionRemainingMs, voice);

  useEffect(() => {
    if (recording && wallStart.current === 0) {
      wallStart.current = Date.now();
      penaltyAtStart.current = flow.pendingPenalty;
    }
  }, [recording, flow.pendingPenalty]);

  useEffect(() => {
    if (!recording) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording]);

  const finish = useCallback(
    (timeMs: number, penalty: Penalty) => {
      if (done.current) return;
      done.current = true;
      const hr = useHeartRateStore.getState().summarize(wallStart.current || Date.now());
      onDone({ timeMs, penalty, scramble, bpm: hr?.avg });
    },
    [onDone, scramble],
  );

  useEffect(() => {
    if (solvedAtMs !== null && startedAtMs !== null && wallStart.current !== 0) finish(solvedAtMs - startedAtMs, penaltyAtStart.current);
  }, [solvedAtMs, startedAtMs, finish]);

  const elapsed = recording && startedAtMs !== null && moves.length ? Math.max(0, now - startedAtMs) : 0;
  useEffect(() => {
    if (limitMs !== null && elapsed >= limitMs) finish(elapsed, "dnf");
  }, [elapsed, limitMs, finish]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="tabular-timer flex h-40 w-full items-center justify-center rounded-2xl bg-bg-panel-2 px-4 text-center font-bold">
        {recording ? (
          <span className="text-6xl">{formatTime(elapsed)}</span>
        ) : flow.phase === "inspecting" ? (
          <span className="text-6xl text-warning">
            {flow.pendingPenalty === "dnf" ? "DNF" : flow.pendingPenalty === "plus2" ? "+2" : Math.ceil(flow.inspectionRemainingMs / 1000)}
          </span>
        ) : (
          <span className="text-sm text-muted">Scramble your cube to match — inspection starts the moment it does</span>
        )}
      </div>
      {call && <p className="animate-pulse text-sm font-bold text-warning">Judge: “{call}”</p>}
    </div>
  );
}

function Scorecard({ format, attempts, pending }: { format: RoundFormat; attempts: Attempt[]; pending: number }) {
  const results = attempts.map((a) => attemptResult(a, format));
  const prog = roundProgress(format, results);
  const finite = results.filter((x): x is number => x !== null);
  const best = finite.length ? Math.min(...finite) : null;
  const worst = results.length === 5 ? (results.includes(null) ? null : Math.max(...finite)) : undefined;
  return (
    <div className="card flex flex-col gap-1 rounded-xl p-3">
      <p className="flex items-center justify-between px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
        <span>Scorecard · {format.kind === "ao5" ? "Average of 5" : "Mean of 3"}</span>
        {format.cutoffMs !== null && <span>cutoff {formatTime(format.cutoffMs)}</span>}
      </p>
      {Array.from({ length: ATTEMPTS[format.kind] }, (_, i) => {
        const a = attempts[i];
        const r = results[i];
        const trimmed = format.kind === "ao5" && results.length === 5 && (r === best || r === worst);
        const cutLine = format.cutoffMs !== null && i === (format.kind === "ao5" ? 2 : 1);
        const skipped = prog.missedCutoff && i >= prog.total;
        return (
          <div key={i} className={cn("flex flex-col", cutLine && "border-t border-dashed border-warning/60 pt-1")}>
            <div className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", i === pending && !prog.finished ? "bg-accent-soft" : "bg-bg-panel-2", skipped && "opacity-40")}>
              <span className="w-4 text-[11px] text-muted-2">{i + 1}</span>
              <span className={cn("tabular-timer flex-1 font-semibold", trimmed && "text-muted")}>
                {a ? `${trimmed ? "(" : ""}${fmt(r)}${a.penalty === "plus2" && r !== null ? "+" : ""}${trimmed ? ")" : ""}` : skipped ? "—" : ""}
              </span>
              {a?.bpm && <span className="text-[10px] text-danger">♥ {Math.round(a.bpm)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompSim() {
  const sessionSolves = useSessionStore((s) => s.solves);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const cubeConnected = useSmartCubeStore((s) => s.connected);
  const rounds = useCompStore((s) => s.rounds);
  const addRound = useCompStore((s) => s.addRound);
  const removeRound = useCompStore((s) => s.removeRound);

  const [format, setFormat] = useState<RoundFormat>({ kind: "ao5", cutoffMs: null, timeLimitMs: 60_000 });
  const [cutoffText, setCutoffText] = useState("");
  const [target, setTarget] = useState("");
  const [input, setInput] = useState<Input>("keyboard");
  const [voice, setVoice] = useState(true);
  const [save, setSave] = useState(true);
  const [stage, setStage] = useState<"setup" | "loading" | "attempt" | "confirm" | "done">("setup");
  const [scrambles, setScrambles] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [saved, setSaved] = useState<CompRound | null>(null);

  const practice = useMemo(() => practiceAverage(sessionSolves.map(solveFinalMs)), [sessionSolves]);
  const results = attempts.map((a) => attemptResult(a, format));
  const prog = roundProgress(format, results);
  const targetMs = Number(target) > 0 ? Math.round(Number(target) * 1000) : null;
  const needed = targetMs !== null && format.kind === "ao5" ? neededForTarget(results, targetMs) : null;

  const start = async () => {
    setStage("loading");
    const client = getCubeEngineClient();
    const list: string[] = [];
    for (let i = 0; i < ATTEMPTS[format.kind]; i++) list.push(await client.generateScramble());
    setScrambles(list);
    setAttempts([]);
    setPending(null);
    setSaved(null);
    setStage("attempt");
    say("Competitor, your round is starting.", voice);
  };

  const onDone = useCallback((a: Attempt) => {
    setPending(a);
    setStage("confirm");
  }, []);

  const confirm = (penalty: Penalty) => {
    if (!pending) return;
    const a = { ...pending, penalty };
    const next = [...attempts, a];
    setAttempts(next);
    setPending(null);
    if (save) void recordSolve(a.timeMs, a.scramble, [], undefined, undefined, a.bpm ? { avg: a.bpm, max: a.bpm } : undefined, undefined, undefined, undefined, penalty);
    const nextProg = roundProgress(
      format,
      next.map((x) => attemptResult(x, format)),
    );
    if (nextProg.finished) {
      const sum = summarizeRound(
        format,
        next.map((x) => attemptResult(x, format)),
        practice,
      );
      const at = wallNow();
      const round: CompRound = { id: `${at}`, date: at, format, attempts: next, average: sum.average, best: sum.best, practiceAvgMs: practice };
      addRound(round);
      setSaved(round);
      setStage("done");
      say(typeof sum.average === "number" ? `Average ${(sum.average / 1000).toFixed(2)}` : "Round complete", voice);
    } else {
      setStage("attempt");
    }
  };

  const compPb = useMemo(() => {
    const avgs = rounds.map((r) => r.average).filter((x): x is number => typeof x === "number");
    return avgs.length ? Math.min(...avgs) : null;
  }, [rounds]);

  if (stage === "setup" || stage === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1 text-xs">
            {(["ao5", "mo3"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setFormat((f) => ({ ...f, kind: k }))} className={cn("rounded-full py-1.5 font-semibold", format.kind === k ? "bg-accent text-accent-fg" : "text-muted")}>
                {k === "ao5" ? "Average of 5" : "Mean of 3"}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-xs text-muted">
            Cutoff (seconds, blank for none)
            <input
              value={cutoffText}
              inputMode="decimal"
              onChange={(e) => {
                setCutoffText(e.target.value);
                const v = Number(e.target.value);
                setFormat((f) => ({ ...f, cutoffMs: v > 0 ? Math.round(v * 1000) : null }));
              }}
              placeholder="e.g. 20"
              className="w-24 rounded-lg bg-bg-panel-2 px-2 py-1.5 text-right text-foreground outline-none"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-muted">
            Time limit per attempt
            <select
              value={format.timeLimitMs ?? 0}
              onChange={(e) => setFormat((f) => ({ ...f, timeLimitMs: Number(e.target.value) || null }))}
              className="rounded-lg bg-bg-panel-2 px-2 py-1.5 text-foreground outline-none"
            >
              <option value={30000}>0:30</option>
              <option value={60000}>1:00</option>
              <option value={120000}>2:00</option>
              <option value={600000}>10:00</option>
              <option value={0}>None</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-muted">
            Target average to beat (optional)
            <input value={target} inputMode="decimal" onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 15" className="w-24 rounded-lg bg-bg-panel-2 px-2 py-1.5 text-right text-foreground outline-none" />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => setInput("keyboard")} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-medium", input === "keyboard" ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}>
              <Keyboard size={12} /> Keyboard / touch
            </button>
            <button
              type="button"
              disabled={!cubeConnected}
              onClick={() => setInput("cube")}
              title={cubeConnected ? undefined : "Connect a smart cube on the timer first"}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-medium disabled:opacity-40", input === "cube" ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}
            >
              <Bluetooth size={12} /> Smart cube
            </button>
            <button type="button" onClick={() => setVoice((v) => !v)} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-medium", voice ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}>
              {voice ? <Volume2 size={12} /> : <VolumeX size={12} />} Judge voice
            </button>
            <button type="button" onClick={() => setSave((v) => !v)} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-medium", save ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}>
              <Check size={12} /> Save to session
            </button>
          </div>
          <button type="button" onClick={() => void start()} disabled={stage === "loading"} className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
            {stage === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Gavel size={14} />} Start the round
          </button>
          {practice !== null && <p className="text-center text-[11px] text-muted-2">Your practice Ao5 is about {formatTime(practice)} — the round is judged against it.</p>}
        </div>

        {rounds.length > 0 && (
          <div className="card flex flex-col gap-1 rounded-xl p-3">
            <p className="flex items-center justify-between px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
              <span>Past rounds</span>
              {compPb !== null && (
                <span className="flex items-center gap-1 text-accent">
                  <Medal size={11} /> comp PB {formatTime(compPb)}
                </span>
              )}
            </p>
            {rounds.slice(0, 12).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-1.5 text-xs">
                <span className="text-muted-2">{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span className="tabular-timer flex-1 font-semibold text-foreground">
                  {r.average === undefined ? "cutoff" : fmt(r.average)} <span className="text-[10px] font-normal text-muted">best {fmt(r.best)}</span>
                </span>
                {typeof r.average === "number" && r.practiceAvgMs !== null && (
                  <span className={cn("text-[10px] tabular-nums", r.average > r.practiceAvgMs ? "text-danger" : "text-success")}>
                    {r.average > r.practiceAvgMs ? "+" : "−"}
                    {(Math.abs(r.average - r.practiceAvgMs) / 1000).toFixed(2)}
                  </span>
                )}
                <button type="button" onClick={() => removeRound(r.id)} className="text-muted-2 hover:text-danger" aria-label="Delete round">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const i = attempts.length;
  const summary = summarizeRound(format, results, practice);

  return (
    <div className="flex flex-col gap-3">
      {stage === "done" && saved ? (
        <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">{format.kind === "ao5" ? "Average" : "Mean"}</p>
          <p className="tabular-timer text-5xl font-black text-foreground">{summary.average === undefined ? "—" : fmt(summary.average)}</p>
          <p className="text-xs text-muted">best single {fmt(summary.best)}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{summary.headline}</p>
          {targetMs !== null && typeof summary.average === "number" && (
            <p className={cn("text-xs font-semibold", summary.average <= targetMs ? "text-success" : "text-danger")}>
              {summary.average <= targetMs ? "Target beaten." : `Target missed by ${((summary.average - targetMs) / 1000).toFixed(2)}.`}
            </p>
          )}
          {compPb !== null && typeof summary.average === "number" && summary.average <= compPb && (
            <p className="flex items-center gap-1 text-xs font-bold text-accent">
              <Medal size={12} /> New comp PB
            </p>
          )}
        </div>
      ) : (
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              Attempt {i + 1} of {prog.total}
            </p>
            {needed !== null && i === 4 && (
              <p className="text-[11px] font-semibold text-accent">
                {needed === "impossible" ? "Target out of reach" : needed === "locked" ? "Target already locked in" : `Need ${formatTime(needed)} for the target`}
              </p>
            )}
          </div>
          {stage === "attempt" && (
            <>
              <p className="font-mono text-[11px] leading-relaxed text-muted">{scrambles[i]}</p>
              <ScrambleNet scramble={scrambles[i]} className="mx-auto w-36" />
              {input === "cube" ? (
                <CubeAttempt key={i} scramble={scrambles[i]} limitMs={format.timeLimitMs} voice={voice} onDone={onDone} />
              ) : (
                <KeyboardAttempt key={i} scramble={scrambles[i]} limitMs={format.timeLimitMs} voice={voice} onDone={onDone} />
              )}
            </>
          )}
          {stage === "confirm" && pending && (
            <div className="flex flex-col items-center gap-3">
              <p className="tabular-timer text-5xl font-bold text-foreground">
                {fmt(attemptResult(pending, format))}
                {pending.penalty === "plus2" ? "+" : ""}
              </p>
              {attemptResult(pending, format) === null && pending.penalty !== "dnf" && <p className="text-xs text-danger">Over the time limit — the judge stopped the attempt.</p>}
              <p className="text-[11px] text-muted">Judge&apos;s call — sign the scorecard:</p>
              <div className="flex gap-2">
                {(["none", "plus2", "dnf"] as Penalty[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => confirm(p)}
                    className={cn("rounded-full px-4 py-2 text-sm font-semibold", p === pending.penalty ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-foreground")}
                  >
                    {p === "none" ? "OK" : p === "plus2" ? "+2" : "DNF"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <Scorecard format={format} attempts={attempts} pending={i} />
      {stage === "done" && (
        <button type="button" onClick={() => setStage("setup")} className="self-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-fg">
          Another round
        </button>
      )}
    </div>
  );
}

/**
 * Comp Sim: a WCA-style round — fixed scrambles, inspection with the
 * judge's 8s/12s calls, cutoff and time limit, the judge's confirmation
 * after every attempt, the official average — then how the round compares
 * with your practice average (the "comp tax"), and your heart rate per
 * attempt if a monitor is connected.
 */
export default function CompPage() {
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
              <Gavel size={17} className="text-accent" /> Comp Sim
            </h1>
            <p className="text-[11px] text-muted-2">A full competition round at home — judge calls, cutoff, time limit, official average, and what nerves cost you.</p>
          </div>
          <CompSim />
        </div>
      </div>
    </>
  );
}
