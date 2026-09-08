"use client";

import { useMemo } from "react";
import type { Solve } from "@/types";
import { computeSessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "—";
}

export function ConsistencyCard({ solves }: { solves: Solve[] }) {
  const stats = useMemo(() => computeSessionStats(solves), [solves]);
  const plus2Count = useMemo(() => solves.filter((s) => s.penalty === "plus2").length, [solves]);

  if (solves.length < 2) {
    return <p className="text-muted-2 text-sm text-center py-6">Solve a bit more to see your consistency.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-2">Std dev</span>
        <span className="tabular-timer text-lg font-semibold">{stats.stdDev !== null ? formatTime(stats.stdDev) : "—"}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-2">DNF rate</span>
        <span className="tabular-timer text-lg font-semibold">{pct(stats.dnfCount, stats.count)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-2">+2 rate</span>
        <span className="tabular-timer text-lg font-semibold">{pct(plus2Count, stats.count)}</span>
      </div>
    </div>
  );
}
