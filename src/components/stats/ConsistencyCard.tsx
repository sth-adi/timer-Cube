"use client";

import { useMemo } from "react";
import type { Solve } from "@/types";
import { computeSessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { StatTile } from "./StatTile";

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
    <div className="grid grid-cols-3 gap-1.5">
      <StatTile label="Std dev" value={stats.stdDev !== null ? formatTime(stats.stdDev) : "—"} />
      <StatTile label="DNF rate" value={pct(stats.dnfCount, stats.count)} />
      <StatTile label="+2 rate" value={pct(plus2Count, stats.count)} />
    </div>
  );
}
