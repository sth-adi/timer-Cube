"use client";

import { useEffect, useRef, useState } from "react";
import type { TimerPhase } from "@/hooks/useTimer";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * A live race against your own PB single: a bar fills toward the PB mark as
 * the clock runs, flipping from "on pace" to "over" the instant elapsed
 * time crosses it. No hardware or recorded run needed — the "ghost" is just
 * your own best time, which is always available the moment you have one.
 *
 * The target is frozen at the moment a run starts (via the ref below)
 * rather than read live off the PB each render, so finishing a new PB
 * doesn't retroactively move the goalpost you were racing against for that
 * same solve's own result line.
 */
export function GhostPaceBar({
  phase,
  elapsedMs,
  pbMs,
  hideTimes,
}: {
  phase: TimerPhase;
  elapsedMs: number;
  /** Current session-best normal single, or null if there isn't one yet. */
  pbMs: number | null;
  hideTimes: boolean;
}) {
  const latestPbRef = useRef<number | null>(pbMs);
  const prevPhaseRef = useRef<TimerPhase>(phase);
  const [target, setTarget] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== "running") latestPbRef.current = pbMs;
  }, [pbMs, phase]);

  useEffect(() => {
    if (phase === "running" && prevPhaseRef.current !== "running") {
      setTarget(latestPbRef.current);
    } else if (phase === "idle") {
      setTarget(null);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  if (target === null || target <= 0) return null;
  if (phase !== "running" && phase !== "stopped") return null;

  const overPb = elapsedMs > target;
  const pct = Math.min(100, (elapsedMs / target) * 100);
  const deltaMs = Math.abs(elapsedMs - target);
  const finished = phase === "stopped";

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-panel-2">
        <div
          className={cn("h-full rounded-full transition-[width] duration-100", overPb ? "bg-danger" : "bg-success")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!hideTimes && (
        <p className={cn("text-[11px] font-medium", overPb ? "text-danger" : "text-success")}>
          {finished
            ? overPb
              ? `+${formatTime(deltaMs)} off ghost PB`
              : `beat ghost PB by ${formatTime(deltaMs)}`
            : overPb
              ? `+${formatTime(deltaMs)} over ghost PB`
              : `${formatTime(deltaMs)} to beat ghost PB`}
        </p>
      )}
    </div>
  );
}
