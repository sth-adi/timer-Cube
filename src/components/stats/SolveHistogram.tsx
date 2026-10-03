"use client";

import { useMemo, useState } from "react";
import type { Solve } from "@/types";
import { comparableTime, computeHistogram } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

export function SolveHistogram({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => computeHistogram(solves, 12), [solves]);
  const median = useMemo(() => {
    const t = solves.map(comparableTime).filter(Number.isFinite).sort((a, b) => a - b);
    if (t.length === 0) return null;
    const mid = Math.floor(t.length / 2);
    return t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2;
  }, [solves]);

  if (buckets.length < 3) {
    return <p className="text-muted-2 text-sm text-center py-6">Solve a few more for a distribution chart.</p>;
  }

  const max = Math.max(...buckets.map((b) => b.count));
  const lo = buckets[0].from;
  const hi = buckets[buckets.length - 1].to;
  const medianPct = median !== null ? ((median - lo) / (hi - lo || 1)) * 100 : null;
  const mode = buckets.findIndex((b) => b.count === max);

  return (
    <div>
      <div className="relative flex h-24 gap-[3px] border-b border-border">
        {buckets.map((b, i) => (
          <div key={i} className="relative h-full flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}>
            <div
              className="absolute bottom-0 left-0 w-full rounded-t-[4px] transition-[background,opacity]"
              style={{
                height: b.count === 0 ? "2px" : `${Math.max(6, (b.count / max) * 100)}%`,
                background: b.count === 0 ? "var(--border)" : "var(--accent)",
                opacity: b.count === 0 ? 1 : hover === i ? 1 : i === mode ? 0.85 : 0.4,
              }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-bg-panel-2 px-2 py-1 text-[11px] tabular-timer shadow-lg">
                {formatTime(b.from)}–{formatTime(b.to)} · <span className="font-semibold">{b.count}</span>
              </div>
            )}
          </div>
        ))}
        {medianPct !== null && (
          <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/40" style={{ left: `${medianPct}%` }}>
            <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted">median {formatTime(median!)}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-2 tabular-timer">
        <span>{formatTime(lo)}</span>
        <span>{formatTime(hi)}</span>
      </div>
    </div>
  );
}
