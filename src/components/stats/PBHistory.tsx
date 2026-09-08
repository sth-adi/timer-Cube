"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import type { Solve } from "@/types";
import { computePBHistory } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

export function PBHistory({ solves }: { solves: Solve[] }) {
  const history = useMemo(() => computePBHistory(solves).reverse(), [solves]);

  if (history.length === 0) {
    return <p className="text-muted-2 text-sm text-center py-6">Your first solve will start the record.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
      {history.map((pb, i) => (
        <li key={pb.solveId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
          <Trophy size={13} className={i === 0 ? "text-warning" : "text-muted-2"} />
          <span className="tabular-timer font-medium flex-1">{formatTime(pb.ms)}</span>
          <span className="text-muted-2 text-xs">solve #{pb.solveIndex}</span>
          <span className="text-muted-2 text-xs w-20 text-right">
            {new Date(pb.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
