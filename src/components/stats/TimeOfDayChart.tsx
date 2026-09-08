"use client";

import { useMemo, useState } from "react";
import type { Solve } from "@/types";
import { computeHourOfDay } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

// Collapse into 6 four-hour blocks — 24 individual bars is too noisy at this size.
const BLOCKS = [
  { label: "12–4a", hours: [0, 1, 2, 3] },
  { label: "4–8a", hours: [4, 5, 6, 7] },
  { label: "8–12p", hours: [8, 9, 10, 11] },
  { label: "12–4p", hours: [12, 13, 14, 15] },
  { label: "4–8p", hours: [16, 17, 18, 19] },
  { label: "8–12a", hours: [20, 21, 22, 23] },
];

export function TimeOfDayChart({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const hourly = useMemo(() => computeHourOfDay(solves), [solves]);

  const blocks = BLOCKS.map((b) => {
    let sum = 0;
    let count = 0;
    for (const h of b.hours) {
      const bucket = hourly[h];
      if (bucket.mean !== null) {
        sum += bucket.mean * bucket.count;
        count += bucket.count;
      }
    }
    return { ...b, mean: count > 0 ? sum / count : null, count };
  });

  const totalSolves = blocks.reduce((n, b) => n + b.count, 0);
  if (totalSolves < 3) {
    return <p className="text-muted-2 text-sm text-center py-6">Solve at different times of day to see this.</p>;
  }

  const means = blocks.map((b) => b.mean).filter((m): m is number => m !== null);
  const best = Math.min(...means);
  const worst = Math.max(...means);
  const span = worst - best || 1;

  return (
    <div className="flex h-24 items-end gap-2">
      {blocks.map((b, i) => {
        const heightPct = b.mean === null ? 0 : 22 + (1 - (b.mean - best) / span) * 78;
        const isBest = b.mean === best;
        return (
          <div
            key={b.label}
            className="flex flex-1 flex-col items-center gap-1"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
          >
            <div className="relative flex h-16 w-full items-end">
              <div
                className="w-full rounded-t-sm transition-colors"
                style={{
                  height: b.mean === null ? "2px" : `${heightPct}%`,
                  background: b.mean === null ? "var(--border)" : isBest ? "var(--success)" : "var(--accent-soft)",
                }}
              />
              {hover === i && b.mean !== null && (
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-bg-panel-2 border border-border-strong px-2 py-1 text-[11px] tabular-timer shadow-lg">
                  {formatTime(b.mean)} avg · {b.count}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-2 whitespace-nowrap">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
