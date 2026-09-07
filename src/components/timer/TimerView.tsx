"use client";

import { useCallback, useEffect } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { playSolveChime } from "@/lib/utils/sound";

const PHASE_COLOR: Record<string, string> = {
  idle: "text-foreground",
  inspecting: "text-danger",
  holding: "text-danger",
  ready: "text-success",
  running: "text-foreground",
  stopped: "text-foreground",
};

export function TimerView() {
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);

  const onComplete = useCallback(
    (timeMs: number) => {
      recordSolve(timeMs, scramble);
      if (soundEnabled) playSolveChime();
      void nextScramble();
    },
    [recordSolve, scramble, nextScramble, soundEnabled],
  );

  const { phase, displayMs, inspectionRemainingMs, press, release, reset } = useTimer({
    inspectionEnabled,
    holdToStartMs,
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
      {showInspection && (
        <p className={cn("tabular-timer text-2xl font-medium", inspectionRemainingMs < 5000 ? "text-danger" : "text-muted")}>
          {Math.ceil(inspectionRemainingMs / 1000)}
        </p>
      )}
      <p
        className={cn(
          "tabular-timer font-bold tracking-tight transition-colors duration-100",
          "text-[18vw] leading-none sm:text-[9rem]",
          PHASE_COLOR[phase],
        )}
      >
        {formatTime(displayMs)}
      </p>
      {phase === "idle" && (
        <p className="text-muted-2 text-sm">hold space to start{inspectionEnabled ? " (inspection on)" : ""}</p>
      )}
      {phase === "stopped" && <p className="text-muted-2 text-sm">space for next scramble</p>}
    </div>
  );
}
