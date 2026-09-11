"use client";

import { useMemo } from "react";
import { Eye } from "lucide-react";
import type { Solve } from "@/types";
import { computeLookaheadScore } from "@/lib/analysis/smartCubeInsights";

/**
 * How long you pause right as a phase ends before starting the next one —
 * the tell for whether recognition happened *during* the previous phase
 * (good lookahead) or *after* it stopped (a visible gap). Trended across
 * your smart-cube solves so you can see it moving, not just a single number.
 */
export function LookaheadScoreCard({ solves }: { solves: Solve[] }) {
  const stat = useMemo(() => computeLookaheadScore(solves), [solves]);

  if (!stat || stat.sampleSize < 3) return null;

  const max = Math.max(1, ...stat.perSolve.map((p) => p.pauseMs));
  const recent = stat.perSolve.slice(-30);

  return (
    <div className="card rounded-xl p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Eye size={14} className="text-accent" />
        Lookahead
      </h3>
      <p className="mb-3 text-2xl font-bold tabular-nums">
        {(stat.avgPauseMs / 1000).toFixed(2)}
        <span className="text-sm font-normal text-muted-2">s avg pause</span>
      </p>
      <div className="flex h-10 items-end gap-0.5">
        {recent.map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-accent/60"
            style={{ height: `${Math.max(6, (p.pauseMs / max) * 100)}%` }}
            title={`${(p.pauseMs / 1000).toFixed(2)}s`}
          />
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
        Time between the last move of a phase and the first move of the next, right at the F2L→OLL and OLL→PLL
        transitions — lower means you spotted the next case before you needed it. Across your last{" "}
        {recent.length} smart-cube solve{recent.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
