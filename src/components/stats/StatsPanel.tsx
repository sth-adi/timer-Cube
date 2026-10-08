"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { averageTrend, comparableTime, computeSessionStats, eventTagsPresent, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { scopedSolves, type StatsScope } from "@/lib/stats/scope";
import { formatTime } from "@/lib/utils/time";
import { EVENT_TAGS, type EventTag } from "@/types";
import { solveFinalMs } from "@/types";
import { cn } from "@/lib/utils/cn";
import { SolveTrendChart } from "./SolveTrendChart";
import { StatTile } from "./StatTile";

/** The last stretch of the ao5 line, drawn small beside the headline number. A null is a DNF window: the line breaks there. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const finite = values.filter((v): v is number => v !== null);
  if (finite.length < 3) return null;
  const W = 120;
  const H = 36;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const span = hi - lo || 1;
  const pt = (v: number, i: number) => `${((i / (values.length - 1)) * (W - 6) + 3).toFixed(1)},${(H - 5 - ((v - lo) / span) * (H - 10)).toFixed(1)}`;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${pt(v, i)}`;
    pen = true;
  });
  const lastValue = values[values.length - 1];
  const last = lastValue === null ? null : pt(lastValue, values.length - 1).split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-[8.5rem] shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9} />
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={1.5} />}
    </svg>
  );
}

const SCOPES: { id: StatsScope; label: string }[] = [
  { id: "session", label: "This session" },
  { id: "all", label: "All sessions" },
];

/** "—" means there aren't enough solves yet; "DNF" means the average exists but is a DNF. */
function fmt(ms: number | null, dnf = false): string {
  if (dnf) return "DNF";
  return ms === null ? "—" : formatTime(ms);
}

export function StatsPanel() {
  const sessionSolves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const scope = useSettingsStore((s) => s.statsScope);
  const setScope = useSettingsStore((s) => s.setStatsScope);
  const rawSolves = useMemo(
    () => scopedSolves(scope, activeSessionId, sessions, sessionSolves, allSolves),
    [scope, activeSessionId, sessions, sessionSolves, allSolves],
  );
  const requestAnalysis = useAnalysisStore((s) => s.requestAnalysis);
  const [selected, setSelected] = useState<EventTag | null>(null);
  const presentTags = useMemo(() => eventTagsPresent(rawSolves), [rawSolves]);

  const solves = useMemo(
    () => (selected ? solvesForEvent(rawSolves, selected) : normalSolves(rawSolves)),
    [rawSolves, selected],
  );
  const stats = useMemo(() => computeSessionStats(solves), [solves]);

  // The same solve computeSessionStats().best is derived from — recomputed
  // here (rather than threading an id through the stats engine) since
  // picking the min by comparableTime is cheap and keeps that engine's
  // return type free of UI-only concerns like "which solve was this".
  const bestSolve = useMemo(() => {
    if (solves.length === 0) return null;
    let winner = solves[0];
    let winnerMs = comparableTime(winner);
    for (const solve of solves) {
      const t = comparableTime(solve);
      if (t < winnerMs) {
        winner = solve;
        winnerMs = t;
      }
    }
    return Number.isFinite(winnerMs) ? winner : null;
  }, [solves]);

  // The ao5 line's last stretch (for the sparkline) and how the latest solve moved it.
  // A DNF window is a gap in the trail and is never compared against.
  const { trail: ao5Trail, change: ao5Change } = useMemo(() => averageTrend(solves, 5), [solves]);
  const ao5Delta = ao5Change?.kind === "delta" ? ao5Change.ms : null;

  const onJumpToBest = bestSolve
    ? () =>
        requestAnalysis(
          bestSolve.scramble,
          solveFinalMs(bestSolve),
          bestSolve.id,
          bestSolve.reconstruction,
          bestSolve.moveTimestamps ?? undefined,
        )
    : undefined;

  return (
    <div className="card rounded-xl p-4 lg:p-5">
      <div className="mb-3 flex flex-wrap gap-1">
        {SCOPES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setScope(opt.id)}
            aria-pressed={scope === opt.id}
            className={cn(
              "hit-y rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              scope === opt.id ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {presentTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            className={cn(
              "hit-y rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              selected === null ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            Normal
          </button>
          {presentTags.map((tag) => {
            const meta = EVENT_TAGS.find((t) => t.id === tag)!;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelected(tag)}
                aria-pressed={selected === tag}
                className={cn(
                  "hit-y rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  selected === tag ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-2">Current ao5</p>
          <p className="tabular-timer mt-1 text-5xl font-bold leading-none tracking-[-0.02em] text-foreground">
            {fmt(stats.ao5, stats.ao5Dnf)}
          </p>
          {ao5Delta !== null && (
            <p
              className={cn(
                "mt-2.5 flex items-center gap-1 text-xs font-medium tabular-nums",
                ao5Delta < -5 ? "text-success" : ao5Delta > 5 ? "text-warning" : "text-muted-2",
              )}
            >
              {ao5Delta < -5 ? <ArrowDownRight size={13} strokeWidth={1.75} /> : ao5Delta > 5 ? <ArrowUpRight size={13} strokeWidth={1.75} /> : <Minus size={13} strokeWidth={1.75} />}
              {Math.abs(ao5Delta) <= 5 ? "Level" : `${ao5Delta < 0 ? "−" : "+"}${(Math.abs(ao5Delta) / 1000).toFixed(2)}`} since the last solve
            </p>
          )}
          {ao5Change?.kind === "dnf" && <p className="mt-2.5 text-xs font-medium text-warning">Too many DNFs in the last 5</p>}
          {ao5Change?.kind === "after-dnf" && <p className="mt-2.5 text-xs font-medium text-muted-2">Back from a DNF ao5</p>}
        </div>
        <Sparkline values={ao5Trail} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-1 border-t border-border pt-3">
        <StatTile label="best" value={fmt(stats.best)} onClick={onJumpToBest} title={onJumpToBest ? "Jump to this solve's reconstruction" : undefined} />
        <StatTile label="ao12" value={fmt(stats.ao12, stats.ao12Dnf)} />
        <StatTile label="ao100" value={fmt(stats.ao100, stats.ao100Dnf)} />
        <StatTile label="mean" value={fmt(stats.mean)} />
        <StatTile label="best ao5" value={fmt(stats.bestAo5, stats.bestAo5Dnf)} />
        <StatTile label="best ao12" value={fmt(stats.bestAo12, stats.bestAo12Dnf)} />
        <StatTile label="worst" value={fmt(stats.worst)} />
        <StatTile label="solves" value={String(stats.count)} sub={scope === "all" ? "all sessions" : undefined} />
      </div>
      {solves.length >= 2 && (
        <div className="mt-4 border-t border-border pt-4">
          <SolveTrendChart solves={solves} />
        </div>
      )}
    </div>
  );
}
