"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import type { Solve } from "@/types";
import { computePBHistory } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/** The record's story, newest first: each entry is a time that was the best you'd ever done when you did it, and by how much it beat the one before. */
export function PBHistory({ solves }: { solves: Solve[] }) {
  const history = useMemo(() => {
    const asc = computePBHistory(solves);
    return asc.map((pb, i) => ({ ...pb, beat: i > 0 ? asc[i - 1].ms - pb.ms : null })).reverse();
  }, [solves]);

  if (history.length === 0) {
    return <p className="text-muted-2 text-sm text-center py-6">Your first solve will start the record.</p>;
  }

  return (
    <ol className="relative max-h-52 overflow-y-auto pl-5">
      <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
      {history.map((pb, i) => (
        <li key={pb.solveId} className="relative flex items-center gap-2 py-1.5">
          <span
            aria-hidden
            className={cn(
              "absolute -left-5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-bg-panel",
              i === 0 ? "bg-warning text-black" : "bg-bg-panel-2 text-muted-2",
            )}
          >
            {i === 0 && <Trophy size={8} />}
          </span>
          <span className={cn("tabular-timer font-semibold", i === 0 ? "text-lg text-foreground" : "text-sm text-muted")}>{formatTime(pb.ms)}</span>
          {pb.beat !== null && <span className="rounded-full bg-success/10 px-1.5 py-px text-[11px] font-medium tabular-nums text-success">−{(pb.beat / 1000).toFixed(2)}</span>}
          <span className="ml-auto text-[11px] text-muted-2">
            #{pb.solveIndex} · {new Date(pb.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </li>
      ))}
    </ol>
  );
}
