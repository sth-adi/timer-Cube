"use client";

import { Sparkles } from "lucide-react";
import type { PostSolvePhaseRow } from "@/lib/analysis/postSolveTable";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

function fmt(ms: number | null): string {
  return ms === null ? "—" : formatTime(ms);
}

/**
 * The Cubeast-style post-solve breakdown: one row per CFOP phase with its
 * case (icon + name, where one applies), total time, and how much of that
 * total was spent recognizing the case versus actually executing it. A real
 * table rather than the scattered pills this used to be — see
 * buildPostSolveRows for where every number comes from.
 */
export function PostSolveTable({ rows }: { rows: PostSolvePhaseRow[] }) {
  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_3.2rem_3.2rem] items-center gap-x-2 gap-y-2 text-[11px]">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Phase</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Total</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Reco</span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-2">Exec</span>

        {rows.map((row) => {
          const algCase = row.group && row.caseName ? findCase(row.group, row.caseName) : undefined;
          return (
            <div key={row.label} className="contents">
              <span className="flex min-w-0 items-center gap-1.5">
                {algCase && (
                  <CaseIcon setupAlg={invertAlg(algCase.alg)} className="h-4 w-7 shrink-0 overflow-hidden rounded-[2px]" />
                )}
                {!algCase && row.group && row.caseName && <Sparkles size={11} className="shrink-0 text-accent" />}
                <span className="truncate">
                  <span className={cn("font-medium", row.totalMs !== null ? "text-foreground" : "text-muted-2")}>
                    {row.label}
                  </span>
                  {row.caseName && <span className="text-muted-2"> · {row.caseName}</span>}
                </span>
              </span>
              <span className="text-right tabular-nums text-foreground">{fmt(row.totalMs)}</span>
              <span className="text-right tabular-nums text-muted-2">{fmt(row.recognitionMs)}</span>
              <span className="text-right tabular-nums text-muted-2">{fmt(row.executionMs)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
