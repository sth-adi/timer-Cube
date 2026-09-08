"use client";

import { useMemo, useState } from "react";
import type { Solve } from "@/types";
import { computeHistogram } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

export function SolveHistogram({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => computeHistogram(solves, 12), [solves]);

  if (buckets.length < 3) {
    return <p className="text-muted-2 text-sm text-center py-6">Solve a few more for a distribution chart.</p>;
  }

  const max = Math.max(...buckets.map((b) => b.count));

  return (
    <div>
      <div className="flex h-24 gap-1">
        {buckets.map((b, i) => (
          <div
            key={i}
            className="group relative h-full flex-1"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
          >
            <div
              className="absolute bottom-0 left-0 w-full rounded-t-sm transition-colors"
              style={{
                height: `${max > 0 ? Math.max(3, (b.count / max) * 100) : 0}%`,
                background: hover === i ? "var(--accent)" : "var(--accent-soft)",
              }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-bg-panel-2 border border-border-strong px-2 py-1 text-[11px] tabular-timer shadow-lg">
                {formatTime(b.from)}–{formatTime(b.to)} · {b.count}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-2 tabular-timer">
        <span>{formatTime(buckets[0].from)}</span>
        <span>{formatTime(buckets[buckets.length - 1].to)}</span>
      </div>
    </div>
  );
}
