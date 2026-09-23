"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useSolveCompletion } from "@/hooks/useSolveCompletion";
import { useTimerInput } from "@/hooks/useTimerInput";
import { isTextField } from "@/lib/timer/timerInput";
import { PHASE_LABELS, type PhaseCount, useSettingsStore } from "@/lib/store/settingsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime } from "@/lib/utils/time";
import { computePhaseSplits, computeSessionStats, normalSolves } from "@/lib/stats/stats";
import type { PhaseAverage } from "@/lib/stats/stats";
import { EVENT_TAGS } from "@/types";
import { cn } from "@/lib/utils/cn";
import { playInspectionBeep } from "@/lib/utils/sound";
import { InspectionRing } from "./InspectionRing";
import { PredictionBadge } from "./PredictionBadge";
import { GhostPaceBar } from "./GhostPaceBar";
import { predictSolveTime } from "@/lib/analysis/prediction";
import { paceFromRatio, resetPerformanceAura, setPerformanceAura } from "@/lib/store/performanceAuraBus";

const PHASE_COLOR: Record<string, string> = {
  idle: "text-foreground",
  inspecting: "text-danger",
  holding: "text-danger",
  ready: "text-success",
  running: "text-foreground",
  stopped: "text-foreground",
};

/**
 * Live phase strip for a multiphase solve: each phase shows its own duration
 * rather than the running total, since "how long was my PLL" is the question
 * splits exist to answer. The phase in progress counts up.
 */
function PhaseTrack({
  labels,
  splits,
  phaseIndex,
  runningMs,
  finished,
  hideTimes,
  historicalPhases,
}: {
  labels: readonly string[];
  splits: number[];
  phaseIndex: number;
  runningMs: number;
  finished: boolean;
  /** Honours "hide time while solving": which phase you're on is fine to show, how long it took isn't. */
  hideTimes: boolean;
  /** Your rolling average for each phase (by position), when enough matching history exists — drives the live pace dot. */
  historicalPhases: readonly PhaseAverage[] | null;
}) {
  const boundaries = [0, ...splits];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {labels.map((label, i) => {
        const done = i < splits.length || (finished && i === splits.length);
        const active = !finished && i === phaseIndex;
        const end = i < splits.length ? splits[i] : runningMs;
        const duration = end - (boundaries[i] ?? 0);
        // Only a genuinely completed phase gets judged against history — the
        // phase still running has no final duration to compare yet.
        const isPastPhase = i < splits.length || (finished && i === splits.length);
        const avgMs = historicalPhases?.[i]?.meanMs;
        const pace = isPastPhase && avgMs !== undefined && !hideTimes ? (duration <= avgMs ? "ahead" : "behind") : null;
        return (
          <div key={label} className="flex flex-col items-center">
            <span
              className={cn(
                "flex items-center gap-1 text-[10px] uppercase tracking-wide",
                active ? "text-accent" : done ? "text-muted" : "text-muted-2",
              )}
            >
              {label}
              {pace && (
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", pace === "ahead" ? "bg-success" : "bg-warning")}
                  title={pace === "ahead" ? "Faster than your average for this phase" : "Slower than your average for this phase"}
                />
              )}
            </span>
            <span
              className={cn(
                "tabular-timer text-sm font-medium",
                active ? "text-accent" : done ? "text-foreground" : "text-muted-2",
              )}
            >
              {hideTimes ? "·" : done || active ? formatTime(duration) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TimerView() {
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const hideTimeWhileSolving = useSettingsStore((s) => s.hideTimeWhileSolving);
  const phaseCount = useSettingsStore((s) => s.phaseCount);
  const timerStyle = useSettingsStore((s) => s.timerStyle);
  const scramble = useScrambleStore((s) => s.scramble);
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const { onStart, onComplete } = useSolveCompletion();

  const { phase, displayMs, inspectionRemainingMs, pendingPenalty, lastResult, splits, phaseIndex, press, release, cancel, reset } = useTimer({
    inspectionEnabled,
    holdToStartMs,
    phaseCount,
    onStart,
    onComplete,
  });

  const removeSolve = useSessionStore((s) => s.removeSolve);
  const solves = useSessionStore((s) => s.solves);

  // Your rolling per-phase average, for the live pace dot — only meaningful
  // once there's a matching-phase-count history to compare against, and
  // recomputed as solves come in so it always reflects up-to-date form.
  const paceSummary = useMemo(() => {
    if (phaseCount <= 1) return null;
    // Only solves phase-timed with the *current* phase count are comparable
    // — history from before you switched, say, 3-phase to 4-phase splits
    // would otherwise get silently treated as if it were the same phases,
    // which computePhaseSplits' own "pick whichever count has the most
    // solves" logic doesn't guarantee on its own.
    const matching = normalSolves(solves).filter((s) => (s.splits?.length ?? 0) + 1 === phaseCount);
    return computePhaseSplits(matching, (n) => PHASE_LABELS[n as PhaseCount] ?? []);
  }, [solves, phaseCount]);

  // The ghost target for GhostPaceBar — only meaningful for ordinary
  // 2-handed solves, same convention as PB detection itself, so racing an
  // OH attempt against a 2-handed best doesn't happen.
  const normalPbMs = useMemo(
    () => (pendingEvent === null ? computeSessionStats(normalSolves(solves)).best : null),
    [solves, pendingEvent],
  );

  // Feeds the ambient background's live pace cue (see AuroraBackground.tsx):
  // prefer the predictive model's estimate for this exact scramble, falling
  // back to the plain PB when there isn't enough history for a model yet.
  // Frozen the moment a run starts, same reasoning as GhostPaceBar's target
  // — a solve shouldn't have its own goalpost move mid-attempt.
  const auraTargetRef = useRef<number | null>(null);
  const prevPhaseForAuraRef = useRef(phase);
  useEffect(() => {
    if (phase === "running" && prevPhaseForAuraRef.current !== "running") {
      const prediction = scramble ? predictSolveTime(normalSolves(solves), scramble) : null;
      auraTargetRef.current = prediction?.predictedMs ?? normalPbMs ?? null;
    }
    if (phase !== "running") {
      auraTargetRef.current = null;
      resetPerformanceAura();
    }
    prevPhaseForAuraRef.current = phase;
  }, [phase, scramble, solves, normalPbMs]);

  useEffect(() => {
    if (phase !== "running" || auraTargetRef.current === null) return;
    setPerformanceAura(paceFromRatio(displayMs, auraTargetRef.current));
  }, [displayMs, phase]);

  useEffect(() => () => resetPerformanceAura(), []);

  const touch = useTimerInput({ press, release, cancel, reset });

  // Delete/Backspace removes the most recent solve — but only when not
  // typing anywhere and the timer isn't live, so it can't eat a real
  // keystroke or nuke a solve mid-attempt.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code !== "Delete" && e.code !== "Backspace") || isTextField(e.target)) return;
      if (phase !== "idle" && phase !== "stopped") return;
      const last = solves[solves.length - 1];
      if (last) {
        e.preventDefault();
        void removeSolve(last.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, solves, removeSolve]);

  // Deliberately no auto-reset here: the just-finished time stays on screen
  // (this is "stopped", not "idle") until the next attempt actually begins —
  // pressing again from "stopped" starts a fresh inspection/hold cycle
  // directly (see useTimer's press()), which is when the display clears.

  const showInspection = (phase === "inspecting" || phase === "holding" || phase === "ready") && inspectionEnabled;
  const labels = PHASE_LABELS[phaseCount];
  const multiphase = phaseCount > 1;

  // WCA-style 8s/12s audible inspection warnings. Tracked with a ref (not
  // state) since these are one-shot side effects per inspection, not
  // something that should trigger a re-render; reset once the cycle ends.
  const beepedRef = useRef({ eight: false, twelve: false });
  useEffect(() => {
    if (!showInspection || !soundEnabled) return;
    if (!beepedRef.current.eight && inspectionRemainingMs <= 7000) {
      beepedRef.current.eight = true;
      playInspectionBeep();
    }
    if (!beepedRef.current.twelve && inspectionRemainingMs <= 3000) {
      beepedRef.current.twelve = true;
      playInspectionBeep();
    }
  }, [showInspection, soundEnabled, inspectionRemainingMs]);
  // Re-arm once inspection is over — not on "idle", which back-to-back
  // attempts never pass through (stopped → press goes straight to inspecting).
  useEffect(() => {
    if (!showInspection) beepedRef.current = { eight: false, twelve: false };
  }, [showInspection]);

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 select-none touch-none"
      {...touch}
    >
      <InspectionRing remainingMs={inspectionRemainingMs} active={showInspection} />

      {showInspection && (
        // Past 15s the countdown is replaced by the penalty a start would now
        // earn — WCA: +2 until 17s, DNF after.
        <p className={cn("tabular-timer text-2xl font-medium", inspectionRemainingMs < 5000 || pendingPenalty !== "none" ? "text-danger" : "text-muted")}>
          {pendingPenalty === "plus2" ? "+2" : pendingPenalty === "dnf" ? "DNF" : Math.ceil(inspectionRemainingMs / 1000)}
        </p>
      )}
      {pendingEvent && (
        <p className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
          {EVENT_TAGS.find((t) => t.id === pendingEvent)?.label}
        </p>
      )}
      <p
        className={cn(
          "timer-digits font-bold transition-colors duration-100",
          "text-[19vw] leading-none sm:text-[9.5rem]",
          timerStyle !== "glow" && `timer-digits--${timerStyle}`,
          PHASE_COLOR[phase],
        )}
      >
        {hideTimeWhileSolving && phase === "running" ? "solving" : formatTime(displayMs)}
      </p>
      {(phase === "running" || phase === "stopped") && (
        <GhostPaceBar
          phase={phase}
          elapsedMs={displayMs}
          pbMs={normalPbMs}
          hideTimes={hideTimeWhileSolving && phase === "running"}
        />
      )}
      {multiphase && (phase === "running" || phase === "stopped") && (
        <PhaseTrack
          labels={labels}
          splits={splits}
          phaseIndex={phaseIndex}
          runningMs={displayMs}
          finished={phase === "stopped"}
          hideTimes={hideTimeWhileSolving && phase === "running"}
          historicalPhases={paceSummary?.phases ?? null}
        />
      )}

      {phase === "idle" && (
        <>
          <p className="text-muted-2 text-sm">
            hold space to start{inspectionEnabled ? " (inspection on)" : ""}
            {multiphase && ` · ${phaseCount} phases`}
          </p>
          <PredictionBadge />
        </>
      )}
      {phase === "stopped" && lastResult && lastResult.penalty !== "none" && (
        <p className="rounded-full bg-danger/15 px-3 py-1 text-sm font-semibold text-danger">
          {lastResult.penalty === "dnf" ? "DNF" : "+2"} — started {((lastResult.inspection?.elapsedMs ?? 0) / 1000).toFixed(2)}s into inspection
        </p>
      )}
      {phase === "stopped" && <p className="text-muted-2 text-sm">space for next scramble</p>}
    </div>
  );
}
