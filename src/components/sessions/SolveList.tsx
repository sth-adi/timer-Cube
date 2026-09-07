"use client";

import { useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { formatResult } from "@/lib/utils/time";
import { comparableTime } from "@/lib/stats/stats";
import { cn } from "@/lib/utils/cn";
import type { Penalty, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { X } from "lucide-react";

function SolveRow({ solve, index, isBest, isWorst }: { solve: Solve; index: number; isBest: boolean; isWorst: boolean }) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const [open, setOpen] = useState(false);

  const cyclePenalty = (p: Penalty) => setPenalty(solve.id, p === solve.penalty ? "none" : p);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-bg-panel-2 transition-colors",
          isBest && "text-success",
          isWorst && "text-danger",
        )}
      >
        <span className="text-muted-2 w-6 text-right tabular-timer">{index}</span>
        <span className="tabular-timer flex-1 text-left ml-2">{formatResult(solveFinalMs(solve), solve.penalty)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex items-center gap-1 rounded-lg glass-panel p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => cyclePenalty("plus2")}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              solve.penalty === "plus2" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground",
            )}
          >
            +2
          </button>
          <button
            type="button"
            onClick={() => cyclePenalty("dnf")}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              solve.penalty === "dnf" ? "bg-danger/20 text-danger" : "text-muted hover:text-foreground",
            )}
          >
            DNF
          </button>
          <button
            type="button"
            onClick={() => removeSolve(solve.id)}
            className="rounded px-2 py-1 text-xs text-muted hover:text-danger"
            aria-label="Delete solve"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function SolveList() {
  const solves = useSessionStore((s) => s.solves);

  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const best = finite.length ? Math.min(...finite) : null;
  const worst = finite.length ? Math.max(...finite) : null;

  if (solves.length === 0) {
    return <p className="text-muted-2 text-sm text-center py-8">No solves yet — hit space to start.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto pr-1">
      {[...solves].reverse().map((solve, i) => {
        const t = comparableTime(solve);
        return (
          <SolveRow
            key={solve.id}
            solve={solve}
            index={solves.length - i}
            isBest={best !== null && t === best}
            isWorst={worst !== null && t === worst && finite.length > 2}
          />
        );
      })}
    </div>
  );
}
