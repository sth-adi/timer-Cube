"use client";

import { INSPECTION_MS } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";
import { cn } from "@/lib/utils/cn";
import {
  INSPECTION_DANGER_AT_MS,
  INSPECTION_WARN_AT_MS,
  inspectionAnnouncement,
  inspectionElapsedMs,
  inspectionPulsing,
  inspectionTone,
  type InspectionTone,
} from "@/components/timer/inspectionTone";

const DIGIT_COLOR: Record<InspectionTone, string> = {
  calm: "text-accent",
  warn: "text-warning",
  danger: "text-danger",
  penalty: "text-danger timer-digits--flat",
};

const FILL_COLOR: Record<InspectionTone, string> = {
  calm: "bg-accent",
  warn: "bg-warning",
  danger: "bg-danger",
  penalty: "bg-danger",
};

/**
 * The inspection countdown. It wears the same colour as the ring around the screen at the same
 * moments (accent, then amber from 8s, red from 12s) and swells briefly as it crosses each mark;
 * only once the +2 applies is it solid red with the penalty spelled out instead of a number.
 * The swell is a transform, so nothing moves, and it is skipped under prefers-reduced-motion.
 */
export function InspectionDigits({ remainingMs, penalty, styleClass }: { remainingMs: number; penalty: Penalty; styleClass?: string }) {
  const tone = inspectionTone(remainingMs, penalty);
  const pulsing = inspectionPulsing(remainingMs, penalty);
  return (
    <p
      className={cn(
        "timer-digits text-center text-6xl font-bold transition-[color,scale] duration-300 motion-reduce:transition-none",
        DIGIT_COLOR[tone],
        pulsing && "scale-110 motion-reduce:scale-100",
        styleClass,
      )}
      data-tone={tone}
    >
      {penalty === "plus2" ? "+2" : penalty === "dnf" ? "DNF" : Math.ceil(remainingMs / 1000)}
    </p>
  );
}

const MARKS = [
  { atMs: INSPECTION_WARN_AT_MS, label: "8", passed: "text-warning" },
  { atMs: INSPECTION_DANGER_AT_MS, label: "12", passed: "text-danger" },
] as const;

/**
 * A small track under the digits with the 8s and 12s marks labelled, so the two warnings read
 * without relying on colour. Fixed height; the fill is the ring's drain, forwards.
 */
export function InspectionTicks({ remainingMs, penalty }: { remainingMs: number; penalty: Penalty }) {
  const tone = inspectionTone(remainingMs, penalty);
  const elapsed = penalty !== "none" ? INSPECTION_MS : inspectionElapsedMs(remainingMs);
  const announcement = inspectionAnnouncement(tone, penalty);
  return (
    <div className="relative h-6 w-44 shrink-0" data-testid="inspection-ticks">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-full bg-bg-panel-2">
        <div className={cn("h-full rounded-full", FILL_COLOR[tone])} style={{ width: `${(elapsed / INSPECTION_MS) * 100}%` }} />
      </div>
      {MARKS.map((m) => {
        const passed = elapsed >= m.atMs;
        return (
          <span key={m.label} aria-hidden className="absolute top-0" style={{ left: `${(m.atMs / INSPECTION_MS) * 100}%` }}>
            <span className="absolute left-0 top-0 h-2.5 w-px -translate-x-1/2 bg-foreground/60" />
            <span className={cn("absolute left-0 top-3 -translate-x-1/2 text-[10px] font-medium leading-none tabular-nums", passed ? cn(m.passed, "font-bold") : "text-muted")}>{m.label}</span>
          </span>
        );
      })}
      {/* Changes only at the marks, so it is announced then and not on every frame. */}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}
