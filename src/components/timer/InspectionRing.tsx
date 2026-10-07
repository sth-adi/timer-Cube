"use client";

import { useSmoothedValue } from "@/components/motion";
import { INSPECTION_MS } from "@/lib/timer/timerMachine";
import { INSPECTION_DANGER_AT_MS, INSPECTION_WARN_AT_MS } from "./inspectionTone";

/** A change in the ring's fill bigger than this fraction in one render is a jump, not the countdown running. */
const RING_JUMP = 0.02;

/**
 * A ring around the edge of the viewport that drains as WCA inspection runs
 * down, shifting colour at the 8s and 12s marks that competitions call out.
 * Peripheral by design: it reads at a glance without pulling your eyes off
 * the scramble the way a countdown number does.
 */
export function InspectionRing({ remainingMs, active }: { remainingMs: number; active: boolean }) {
  // Exact while the countdown just runs down; a jump (the first frame's clock correction) glides.
  // Held full while inactive, so the next inspection starts from a full ring rather than filling up.
  const progress = useSmoothedValue(active ? Math.max(0, Math.min(1, remainingMs / INSPECTION_MS)) : 1, { jumpAbove: RING_JUMP, min: 0, max: 1 });
  if (!active) return null;

  const elapsed = INSPECTION_MS - remainingMs;
  const color = elapsed >= INSPECTION_DANGER_AT_MS ? "var(--danger)" : elapsed >= INSPECTION_WARN_AT_MS ? "var(--warning)" : "var(--accent)";

  return (
    <svg
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {/* pathLength normalises the perimeter to 1 regardless of aspect ratio,
          so the dash maths is the same on any screen. */}
      <rect
        x="0.6"
        y="0.6"
        width="98.8"
        height="98.8"
        rx="2"
        ry="2"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        vectorEffect="non-scaling-stroke"
        style={{ transition: "stroke 300ms ease" }}
        opacity={0.9}
      />
    </svg>
  );
}
