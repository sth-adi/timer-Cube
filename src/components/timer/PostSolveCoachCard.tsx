"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { generateCoachReport, coachInputFromPostSolveRows } from "@/lib/analysis/coach";
import type { PostSolvePhaseRow } from "@/lib/analysis/postSolveTable";

interface PostSolveCoachCardProps {
  rows: PostSolvePhaseRow[];
  totalMs: number;
  tps: number | null;
  sessionMeanMs: number | null;
  isNewPB: boolean;
}

/**
 * A written, conversational summary of the solve that just finished — see
 * lib/analysis/coach.ts for how it's generated (deterministic, data-driven,
 * no network call). Sits below the phase table since it reads best as "here
 * are the numbers, here's what they mean" in that order.
 */
export function PostSolveCoachCard({ rows, totalMs, tps, sessionMeanMs, isNewPB }: PostSolveCoachCardProps) {
  const report = useMemo(
    () => generateCoachReport(coachInputFromPostSolveRows(rows, totalMs, tps, sessionMeanMs, isNewPB)),
    [rows, totalMs, tps, sessionMeanMs, isNewPB],
  );

  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
        <Sparkles size={11} className="text-accent" />
        Coach
      </div>
      <p className="mb-1 text-sm font-semibold text-foreground">{report.headline}</p>
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted">
        {report.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
