"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import type { Penalty, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeSessionStats, comparableTime, normalSolves } from "@/lib/stats/stats";
import { pbTargets, type AverageTarget } from "@/lib/stats/targets";
import { formatResult, formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const CHIPS = 6;

function targetText(t: AverageTarget): string | null {
  if (t.need === null) return null; // out of reach this time — say nothing rather than discourage
  if (t.need === "any") return `ao${t.n} record: any time`;
  return `ao${t.n} record: ${formatTime(t.need)} or faster`;
}

/**
 * The session at a glance, between solves: the last few results, where your
 * averages stand, and exactly what the next solve has to be to set a new
 * record — the same records (and the same average rules) as the stats panel.
 */
export function SessionStrip({ className }: { className?: string }) {
  const solves = useSessionStore((s) => s.solves);
  const mine = useMemo(() => normalSolves(solves), [solves]);
  const stats = useMemo(() => computeSessionStats(mine), [mine]);
  const targets = useMemo(() => pbTargets(mine.map(comparableTime)), [mine]);

  if (mine.length === 0) return null;
  const recent = mine.slice(-CHIPS);
  const bestMs = stats.best;
  const lines = [
    targets.single !== null ? `single record: under ${formatTime(targets.single)}` : null,
    ...targets.averages.map(targetText),
  ].filter((l): l is string => l !== null);

  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-2 border-t border-border px-3 pt-3", className)} data-testid="session-strip">
      <div className="flex items-center justify-center gap-1.5">
        {recent.map((s) => {
          const final = solveFinalMs(s);
          const isBest = final !== null && bestMs !== null && final === bestMs;
          return (
            <span
              key={s.id}
              className={cn(
                "tabular-timer rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                s.penalty === "dnf" ? "bg-danger/10 text-danger" : isBest ? "bg-warning/15 text-warning" : "bg-bg-panel-2 text-muted",
              )}
              title={s.penalty === "plus2" ? "+2 penalty" : undefined}
            >
              {formatResult(final, s.penalty)}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-3 text-[11px] text-muted-2">
        <span>{mine.length} solves</span>
        {(stats.ao5 !== null || stats.ao5Dnf) && (
          <span>
            ao5 <b className="tabular-timer font-semibold text-foreground">{stats.ao5 !== null ? formatTime(stats.ao5) : "DNF"}</b>
          </span>
        )}
        {(stats.ao12 !== null || stats.ao12Dnf) && (
          <span>
            ao12 <b className="tabular-timer font-semibold text-foreground">{stats.ao12 !== null ? formatTime(stats.ao12) : "DNF"}</b>
          </span>
        )}
        {stats.mean !== null && (
          <span>
            mean <b className="tabular-timer font-semibold text-foreground">{formatTime(stats.mean)}</b>
          </span>
        )}
      </div>
      {lines.length > 0 && (
        <div className="flex flex-col items-center gap-0.5 border-t border-border pt-1.5" data-testid="session-targets">
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-2">
            <Target size={11} /> To set a record
          </span>
          {lines.map((l) => (
            <span key={l} className="tabular-timer text-[11px] text-accent">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** +2 / DNF toggles for the solve that was just saved — a misaligned finish, a bump, a rule you broke. */
export function PenaltyControls({ solve, onSet }: { solve: Solve; onSet: (penalty: Penalty) => void }) {
  const option = (value: Exclude<Penalty, "none">, label: string) => {
    const on = solve.penalty === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => onSet(on ? "none" : value)}
        aria-pressed={on}
        className={cn(
          "hit-y rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
          on ? (value === "dnf" ? "bg-danger text-white" : "bg-warning text-black") : "bg-bg-panel-2 text-muted hover:text-foreground",
        )}
      >
        {label}
      </button>
    );
  };
  return (
    <span className="flex items-center gap-1" data-testid="penalty-controls">
      {option("plus2", "+2")}
      {option("dnf", "DNF")}
    </span>
  );
}
