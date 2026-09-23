"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Metronome, Play, Square, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { analyzeTempo, phaseLabels, type TempoJudgement, type TempoReport } from "@/lib/tempo/tempo";
import { cn } from "@/lib/utils/cn";

const COUNT_IN = 4;
const JUDGE_COLOR: Record<TempoJudgement, string> = { perfect: "bg-success", good: "bg-warning", off: "bg-danger" };

type Phase = "idle" | "running" | "done";

/**
 * A look-ahead metronome on the Web Audio clock: clicks are scheduled a
 * little ahead of time so they stay rock steady even when the main thread
 * is busy. Beat 0 is the first beat after a four-click count-in.
 */
function useMetronome() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  /** Starts clicking; returns the performance.now() time of beat 0. */
  const start = useCallback(
    (bpm: number): number => {
      stop();
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      void ctx.resume();
      const period = 60 / bpm;
      const audioStart = ctx.currentTime + 0.1;
      const perfStart = performance.now() + 100;
      let next = 0;
      const click = (when: number, accent: boolean) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = accent ? 1500 : 1000;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
        osc.connect(gain).connect(ctx.destination);
        osc.start(when);
        osc.stop(when + 0.06);
      };
      const schedule = () => {
        while (audioStart + next * period < ctx.currentTime + 0.12) {
          click(audioStart + next * period, next < COUNT_IN || (next - COUNT_IN) % 4 === 0);
          next++;
        }
      };
      schedule();
      timerRef.current = window.setInterval(schedule, 25);
      return perfStart + COUNT_IN * period * 1000;
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { start, stop };
}

function Report({ report }: { report: TempoReport }) {
  const phases = ["Cross", "F2L", "OLL", "PLL"];
  const maxMissed = Math.max(1, ...Object.values(report.missedByPhase));
  return (
    <div className="card flex flex-col gap-3 rounded-xl p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [`${Math.round(report.smoothness * 100)}%`, "beats with a turn"],
          [`${Math.round(((report.counts.perfect + report.counts.good) / report.turns.length) * 100)}%`, "turns on the beat"],
          [`${report.longestGap}`, "longest silence (beats)"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-bg-panel-2 px-2 py-2">
            <p className="text-lg font-bold tabular-nums text-foreground">{v}</p>
            <p className="text-[10px] leading-tight text-muted-2">{l}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Every turn against the beat</p>
        <div className="flex flex-wrap gap-[3px]">
          {report.turns.map((t, i) => (
            <span key={i} className={cn("h-3 w-3 rounded-sm", JUDGE_COLOR[t.judgement])} title={`${Math.round(t.offsetMs)} ms`} />
          ))}
        </div>
        <p className="text-[10px] text-muted-2">
          {report.counts.perfect} perfect · {report.counts.good} close · {report.counts.off} off the beat
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Where you lost the beat</p>
        {phases.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-10 text-[11px] text-muted">{p}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-panel-2">
              <div className="h-full rounded-full bg-danger/70" style={{ width: `${((report.missedByPhase[p] ?? 0) / maxMissed) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-[10px] tabular-nums text-muted-2">{report.missedByPhase[p] ?? 0} missed</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted">
        {report.suggestedBpm > report.bpm
          ? `Smooth at ${report.bpm} BPM — try ${report.suggestedBpm} next.`
          : report.suggestedBpm < report.bpm
            ? `Too many missed beats — drop to ${report.suggestedBpm} BPM until you can keep turning through every look.`
            : `Stay at ${report.bpm} BPM until nearly every beat has a turn.`}
      </p>
    </div>
  );
}

/**
 * Tempo Trainer: solve to a metronome with every turn scored against the
 * click — the classic slow-turning lookahead drill, finally measurable.
 */
function TempoTrainer() {
  const [bpm, setBpm] = useState(120);
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<TempoReport | null>(null);
  const [live, setLive] = useState<TempoJudgement[]>([]);
  const [beatPulse, setBeatPulse] = useState(0);
  const metronome = useMetronome();
  const beat0Ref = useRef(0);
  const bpmRef = useRef(bpm);
  const phaseRef = useRef<Phase>("idle");
  const movesRef = useRef<{ token: string; at: number }[]>([]);
  const startFaceletsRef = useRef("");

  const finish = useCallback(() => {
    metronome.stop();
    phaseRef.current = "done";
    setPhase("done");
    const moves = movesRef.current;
    const labels = phaseLabels(startFaceletsRef.current, moves.map((m) => m.token));
    setReport(analyzeTempo(moves.map((m) => m.at - beat0Ref.current), bpmRef.current, labels));
  }, [metronome]);

  const start = () => {
    movesRef.current = [];
    setLive([]);
    setReport(null);
    bpmRef.current = bpm;
    startFaceletsRef.current = useSmartCubeStore.getState().liveFacelets;
    beat0Ref.current = metronome.start(bpm);
    phaseRef.current = "running";
    setPhase("running");
  };

  // Visual beat pulse, driven off the same clock as the scoring.
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const period = 60000 / bpm;
    const tick = () => {
      setBeatPulse(Math.floor((performance.now() - beat0Ref.current) / period));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, bpm]);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current !== "running") return;
      movesRef.current.push({ token: m.token, at: m.timeStampMs });
      const period = 60000 / bpmRef.current;
      const rel = m.timeStampMs - beat0Ref.current;
      const share = Math.abs(rel - Math.round(rel / period) * period) / period;
      setLive((l) => [...l.slice(-23), share <= 0.12 ? "perfect" : share <= 0.25 ? "good" : "off"]);
      window.setTimeout(() => {
        if (phaseRef.current === "running" && useSmartCubeStore.getState().liveFacelets === SOLVED_FACELETS) finish();
      }, 0);
    });
  }, [finish]);

  const counting = phase === "running" && beatPulse < 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-4 rounded-xl p-5">
        <div
          key={beatPulse}
          className={cn(
            "flex h-28 w-28 items-center justify-center rounded-full text-3xl font-black transition-transform",
            phase === "running" ? "animate-[gyro-pop_0.25s_ease-out]" : "",
            counting ? "bg-warning/20 text-warning" : phase === "running" ? (beatPulse % 4 === 0 ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent") : "bg-bg-panel-2 text-muted",
          )}
        >
          {counting ? -beatPulse : phase === "running" ? (beatPulse % 4) + 1 : bpm}
        </div>
        {phase !== "running" ? (
          <>
            <div className="flex w-full flex-col gap-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>{bpm} BPM</span>
                <span>{(bpm / 60).toFixed(1)} turns / second</span>
              </div>
              <input
                type="range"
                min={40}
                max={480}
                step={5}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
                aria-label="Tempo"
              />
            </div>
            <p className="max-w-xs text-center text-[11px] text-muted">
              Scramble your cube, then start. After a 4-click count-in, make one turn on every click — no stopping to look. Ends by
              itself when the cube is solved.
            </p>
            <button type="button" onClick={start} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg">
              <Play size={13} /> {report ? "Go again" : "Start"}
            </button>
            {report && report.suggestedBpm !== bpm && (
              <button type="button" onClick={() => setBpm(report.suggestedBpm)} className="text-xs font-medium text-accent underline-offset-2 hover:underline">
                Use suggested {report.suggestedBpm} BPM
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex h-4 flex-wrap justify-center gap-[3px]">
              {live.map((j, i) => (
                <span key={i} className={cn("h-3 w-3 rounded-sm", JUDGE_COLOR[j])} />
              ))}
            </div>
            <button type="button" onClick={finish} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground">
              <Square size={11} fill="currentColor" /> Stop
            </button>
          </>
        )}
      </div>
      {phase === "done" && report && <Report report={report} />}
      {phase === "done" && !report && <p className="text-center text-xs text-muted">No turns recorded.</p>}
    </div>
  );
}

export default function TempoPage() {
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
              <Metronome size={17} className="text-accent" /> Tempo Trainer
            </h1>
            <p className="text-[11px] text-muted-2">Solve to a metronome — every turn scored on the beat, every silence traced to its phase.</p>
          </div>
          <ConnectGate blurb="The Tempo Trainer times every turn against the click, so it needs a connected smart cube.">
            <TempoTrainer />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
