"use client";

import { useCallback, useEffect } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

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
  const recordSolve = useSessionStore((s) => s.recordSolve);
  const scramble = useScrambleStore((s) => s.scramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);

  const onComplete = useCallback(
    (timeMs: number) => {
      recordSolve(timeMs, scramble);
      void nextScramble();
    },
    [recordSolve, scramble, nextScramble],
  );

  const { phase, displayMs, inspectionRemainingMs, press, release, reset } = useTimer({
    inspectionEnabled,
    holdToStartMs,
    onComplete,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      e.preventDefault();
      press();
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
  }, [press, release]);

  useEffect(() => {
    if (phase === "stopped") {
      const t = setTimeout(() => reset(), 50);
      return () => clearTimeout(t);
    }
  }, [phase, reset]);

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
    </div>
  );
}
