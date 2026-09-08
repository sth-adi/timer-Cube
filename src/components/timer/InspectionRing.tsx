"use client";

const INSPECTION_MS = 15_000;

/**
 * A ring around the edge of the viewport that drains as WCA inspection runs
 * down, shifting colour at the 8s and 12s marks that competitions call out.
 * Peripheral by design: it reads at a glance without pulling your eyes off
 * the scramble the way a countdown number does.
 */
export function InspectionRing({ remainingMs, active }: { remainingMs: number; active: boolean }) {
  if (!active) return null;

  const progress = Math.max(0, Math.min(1, remainingMs / INSPECTION_MS));
  const elapsed = INSPECTION_MS - remainingMs;
  const color = elapsed >= 12_000 ? "var(--danger)" : elapsed >= 8_000 ? "var(--warning)" : "var(--accent)";

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
