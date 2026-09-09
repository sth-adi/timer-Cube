"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTimer } from "@/hooks/useTimer";
import { PHASE_LABELS, useSettingsStore } from "@/lib/store/settingsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { playSolveChime, playInspectionBeep } from "@/lib/utils/sound";
import { InspectionRing } from "./InspectionRing";

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
}: {
  labels: readonly string[];
  splits: number[];
  phaseIndex: number;
  runningMs: number;
  finished: boolean;
  /** Honours "hide time while solving": which phase you're on is fine to show, how long it took isn't. */
  hideTimes: boolean;
}) {
  const boundaries = [0, ...splits];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {labels.map((label, i) => {
        const done = i < splits.length || (finished && i === splits.length);
        const active = !finished && i === phaseIndex;
        const end = i < splits.length ? splits[i] : runningMs;
        const duration = end - (boundaries[i] ?? 0);
        return (
          <div key={label} className="flex flex-col items-center">
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide",
                active ? "text-accent" : done ? "text-muted" : "text-muted-2",
              )}
            >
              {label}
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
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);

  const onComplete = useCallback(
    (timeMs: number, solveSplits: number[]) => {
      recordSolve(timeMs, scramble, solveSplits);
      if (soundEnabled) playSolveChime();
      void nextScramble();
    },
    [recordSolve, scramble, nextScramble, soundEnabled],
  );

  const { phase, displayMs, inspectionRemainingMs, splits, phaseIndex, press, release, reset } = useTimer({
    inspectionEnabled,
    holdToStartMs,
    phaseCount,
    onComplete,
  });

  const removeSolve = useSessionStore((s) => s.removeSolve);
  const solves = useSessionStore((s) => s.solves);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && ["INPUT", "TEXTAREA"].includes(target.tagName);

      if (e.code === "Space" && !e.repeat && !inField) {
        e.preventDefault();
        press();
        return;
      }
      if (e.code === "Escape" && !inField) {
        e.preventDefault();
        reset();
        return;
      }
      // Delete/Backspace removes the most recent solve — but only when not
      // typing anywhere and the timer isn't live, so it can't eat a real
      // keystroke or nuke a solve mid-attempt.
      if ((e.code === "Delete" || e.code === "Backspace") && !inField && (phase === "idle" || phase === "stopped")) {
        const last = solves[solves.length - 1];
        if (last) {
          e.preventDefault();
          void removeSolve(last.id);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [press, release, reset, phase, solves, removeSolve]);

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
  useEffect(() => {
    if (phase === "idle") beepedRef.current = { eight: false, twelve: false };
  }, [phase]);

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 select-none touch-none"
      onTouchStart={(e) => {
        e.preventDefault();
        press();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        release();
      }}
    >
      <InspectionRing remainingMs={inspectionRemainingMs} active={showInspection} />

      {showInspection && (
        <p className={cn("tabular-timer text-2xl font-medium", inspectionRemainingMs < 5000 ? "text-danger" : "text-muted")}>
          {Math.ceil(inspectionRemainingMs / 1000)}
        </p>
      )}
      <p
        className={cn(
          "timer-digits font-bold transition-colors duration-100",
          "text-[19vw] leading-none sm:text-[9.5rem]",
          PHASE_COLOR[phase],
        )}
      >
        {hideTimeWhileSolving && phase === "running" ? "solving" : formatTime(displayMs)}
      </p>
      {multiphase && (phase === "running" || phase === "stopped") && (
        <PhaseTrack
          labels={labels}
          splits={splits}
          phaseIndex={phaseIndex}
          runningMs={displayMs}
          finished={phase === "stopped"}
          hideTimes={hideTimeWhileSolving && phase === "running"}
        />
      )}

      {phase === "idle" && (
        <p className="text-muted-2 text-sm">
          hold space to start{inspectionEnabled ? " (inspection on)" : ""}
          {multiphase && ` · ${phaseCount} phases`}
        </p>
      )}
      {phase === "stopped" && <p className="text-muted-2 text-sm">space for next scramble</p>}
    </div>
  );
}
