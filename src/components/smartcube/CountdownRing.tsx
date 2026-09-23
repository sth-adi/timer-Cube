"use client";

/** A shrinking ring with the seconds left in the middle — accent, then amber under 8s, red under 4s. */
export function CountdownRing({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx={50} cy={50} r={45} fill="none" stroke="var(--bg-panel-2)" strokeWidth={8} />
        <circle
          cx={50}
          cy={50}
          r={45}
          fill="none"
          stroke={remainingMs < 4000 ? "var(--danger)" : remainingMs < 8000 ? "var(--warning)" : "var(--accent)"}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, remainingMs) / totalMs) * 283} 283`}
        />
      </svg>
      <span className="tabular-timer text-4xl font-bold text-foreground">{Math.ceil(Math.max(0, remainingMs) / 1000)}</span>
    </div>
  );
}
