"use client";

import { useMemo } from "react";
import { aggregateMistakes, analyzeMistakes, type MistakeReport } from "@/lib/analysis/mistakeRadar";
import { KIND_COLOR } from "./MistakeRadarCard";
import type { Solve } from "@/types";

/** Most recent smart-cube solves replayed — each is a full move-by-move simulation, so this is capped to keep the page snappy. */
const MAX_SOLVES = 100;

/**
 * Mistake Radar across your history: which blunder habit is costing the
 * most time per solve on average, and how clean your recent solves have been.
 */
export function MistakeHistory({ solves }: { solves: readonly Solve[] }) {
  const reports = useMemo(() => {
    const eligible = solves
      .filter((s) => s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0 && s.scramble)
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_SOLVES)
      .reverse();
    return eligible.map((s): MistakeReport => {
      const moves = s.reconstruction!.split(/\s+/).filter(Boolean);
      return analyzeMistakes({ scramble: s.scramble, moves, timesMs: s.moveTimestamps!, totalMs: s.timeMs });
    });
  }, [solves]);
  const habits = useMemo(() => aggregateMistakes(reports), [reports]);

  if (reports.length === 0) {
    return <p className="py-4 text-center text-xs text-muted">Your smart-cube solves will be scanned for mistakes here.</p>;
  }

  const avgLost = reports.reduce((s, r) => s + r.totalCostMs, 0) / reports.length;
  const cleanShare = reports.filter((r) => r.mistakes.length === 0).length / reports.length;
  const maxHabit = Math.max(1, ...habits.map((h) => h.costPerSolveMs));
  const w = 280;
  const h = 44;
  const points = reports
    .map((r, i) => `${reports.length === 1 ? w / 2 : (i / (reports.length - 1)) * w},${h - (r.cleanScore / 100) * (h - 4) - 2}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-danger">−{(avgLost / 1000).toFixed(2)}s</p>
          <p className="text-[10px] text-muted-2">lost per solve</p>
        </div>
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-success">{Math.round(cleanShare * 100)}%</p>
          <p className="text-[10px] text-muted-2">clean solves</p>
        </div>
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-foreground">{reports.length}</p>
          <p className="text-[10px] text-muted-2">solves scanned</p>
        </div>
      </div>

      {reports.length > 1 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Clean score, oldest → newest</p>
          <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      {habits.length === 0 ? (
        <p className="text-xs text-success">No mistakes found in any scanned solve.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Most expensive habits</p>
          {habits.map((hb) => (
            <div key={hb.kind} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[hb.kind] }} />
                  {hb.label}
                </span>
                <span className="tabular-nums text-muted">
                  {(hb.costPerSolveMs / 1000).toFixed(2)}s/solve · in {hb.solvesAffected} of {reports.length}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-panel-2">
                <div className="h-full rounded-full" style={{ width: `${(hb.costPerSolveMs / maxHabit) * 100}%`, background: KIND_COLOR[hb.kind] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
