"use client";

import { useEffect, useRef, useState } from "react";
import type { TimerPhase } from "@/hooks/useTimer";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * A live race against your own best single in this session: a bar fills
 * toward the mark as the clock runs, flipping from "on pace" to "over" the
 * instant elapsed time crosses it. No hardware or recorded run needed — the
 * "ghost" is just your own best time, which is always available the moment
 * you have one. (Both call sites pass the open session's best, hence the
 * default label; pass `label` if a caller ever races something else.)
 *
 * The fill is driven by a transform computed straight from elapsedMs, with no
 * CSS transition: a transition on a value that already changes every frame
 * only makes the bar trail the clock, so it's left to track it exactly.
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
  label = "session best",
}: {
  phase: TimerPhase;
  elapsedMs: number;
  /** Current session-best normal single, or null if there isn't one yet. */
  pbMs: number | null;
  hideTimes: boolean;
  /** What the target is called in the readout. */
  label?: string;
}) {
  const latestPbRef = useRef<number | null>(pbMs);
  const prevPhaseRef = useRef<TimerPhase>(phase);
  const [target, setTarget] = useState<number | null>(null);
  // A one-shot flash the instant the bar first crosses from "over" to
  // "ahead" — the moment you actually pull into the lead, not just any
  // frame where you happen to be ahead. Tracked via a ref (not state) so it
  // doesn't itself trigger a render loop, and reset whenever a fresh target
  // is picked so a new solve starts with a clean slate.
  const prevOverRef = useRef<boolean | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (phase !== "running") latestPbRef.current = pbMs;
  }, [pbMs, phase]);

  useEffect(() => {
    if (phase === "running" && prevPhaseRef.current !== "running") {
      setTarget(latestPbRef.current);
      prevOverRef.current = null;
    } else if (phase === "idle") {
      setTarget(null);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const overPb = target !== null && target > 0 && elapsedMs > target;

  useEffect(() => {
    if (phase === "running" && prevOverRef.current === true && !overPb) setPulseKey((k) => k + 1);
    prevOverRef.current = overPb;
  }, [overPb, phase]);

  if (target === null || target <= 0) return null;
  if (phase !== "running" && phase !== "stopped") return null;

  const pct = Math.min(100, (elapsedMs / target) * 100);
  const deltaMs = Math.abs(elapsedMs - target);
  const finished = phase === "stopped";

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-bg-panel-2">
        <div
          className={cn("h-full w-full rounded-full will-change-transform", overPb ? "bg-danger" : "bg-success")}
          style={{ transform: `translateX(${pct - 100}%)` }}
        />
        {pulseKey > 0 && !overPb && (
          <span key={pulseKey} aria-hidden className="absolute inset-0 animate-[lead-pulse_420ms_ease-out] rounded-full bg-success/70 motion-reduce:hidden" />
        )}
      </div>
      {!hideTimes && (
        <p className={cn("text-[11px] font-medium", overPb ? "text-danger" : "text-success")}>
          {finished
            ? overPb
              ? `+${formatTime(deltaMs)} off ${label}`
              : `beat ${label} by ${formatTime(deltaMs)}`
            : overPb
              ? `+${formatTime(deltaMs)} over ${label}`
              : `${formatTime(deltaMs)} to beat ${label}`}
        </p>
      )}
    </div>
  );
}
