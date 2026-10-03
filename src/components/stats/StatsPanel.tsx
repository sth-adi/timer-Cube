"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { comparableTime, computeSessionStats, eventTagsPresent, normalSolves, rollingAverages, solvesForEvent } from "@/lib/stats/stats";
import { scopedSolves, type StatsScope } from "@/lib/stats/scope";
import { formatTime } from "@/lib/utils/time";
import { EVENT_TAGS, type EventTag } from "@/types";
import { solveFinalMs } from "@/types";
import { cn } from "@/lib/utils/cn";
import { SolveTrendChart } from "./SolveTrendChart";

/** A small tile: label over value, with an optional "jump" action. */
function Stat({ label, value, note, onClick }: { label: string; value: string; note?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-2 group-hover:text-accent">
        {label}
        {onClick && <ArrowUpRight size={10} className="opacity-0 transition-opacity group-hover:opacity-100" />}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span className="tabular-timer text-base font-semibold text-foreground group-hover:text-accent">{value}</span>
        {note && <span className="text-[11px] font-normal text-muted-2">{note}</span>}
      </span>
    </>
  );
  const cls = "group flex flex-col items-start gap-0.5 rounded-lg bg-bg-panel-2/70 px-2.5 py-2 text-left max-lg:bg-transparent max-lg:px-1 max-lg:py-1";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title="Jump to this solve's reconstruction" className={cn(cls, "transition-colors hover:bg-bg-panel-2")}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** The last stretch of the ao5 line, drawn small beside the headline number. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 3) return null;
  const W = 120;
  const H = 36;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pt = (v: number, i: number) => `${((i / (values.length - 1)) * (W - 6) + 3).toFixed(1)},${(H - 5 - ((v - lo) / span) * (H - 10)).toFixed(1)}`;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${pt(v, i)}`).join(" ");
  const last = pt(values[values.length - 1], values.length - 1).split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-[7.5rem] shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9} />
      <circle cx={last[0]} cy={last[1]} r={3} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={1.5} />
    </svg>
  );
}

const SCOPES: { id: StatsScope; label: string }[] = [
  { id: "session", label: "This session" },
  { id: "all", label: "All sessions" },
];

function fmt(ms: number | null): string {
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
  const { ao5Trail, ao5Delta } = useMemo(() => {
    const rolling = rollingAverages(solves, 5).filter((v): v is number => v !== null && Number.isFinite(v));
    const n = rolling.length;
    return { ao5Trail: rolling.slice(-24), ao5Delta: n >= 2 ? rolling[n - 1] - rolling[n - 2] : null };
  }, [solves]);

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
    <div className="card rounded-xl p-3 lg:p-4">
      <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {SCOPES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setScope(opt.id)}
            aria-pressed={scope === opt.id}
            className={cn(
              "hit-y rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              scope === opt.id ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {presentTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            className={cn(
              "hit-y rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              selected === null ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
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
                  "hit-y rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  selected === tag ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-2">Current ao5</p>
          <p className="tabular-timer bg-gradient-to-b from-foreground to-accent bg-clip-text text-4xl font-bold leading-none text-transparent">
            {fmt(stats.ao5)}
          </p>
          {ao5Delta !== null && (
            <p
              className={cn(
                "mt-1.5 flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                ao5Delta < -5 ? "text-success" : ao5Delta > 5 ? "text-warning" : "text-muted-2",
              )}
            >
              {ao5Delta < -5 ? <ArrowDownRight size={12} /> : ao5Delta > 5 ? <ArrowUpRight size={12} /> : <Minus size={12} />}
              {Math.abs(ao5Delta) <= 5 ? "Level" : `${ao5Delta < 0 ? "−" : "+"}${(Math.abs(ao5Delta) / 1000).toFixed(2)}`} since the last solve
            </p>
          )}
        </div>
        <Sparkline values={ao5Trail} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-1.5 gap-y-0.5 lg:mt-3 lg:gap-1.5">
        <Stat label="best" value={fmt(stats.best)} onClick={onJumpToBest} />
        <Stat label="ao12" value={fmt(stats.ao12)} />
        <Stat label="ao100" value={fmt(stats.ao100)} />
        <Stat label="mean" value={fmt(stats.mean)} />
        <Stat label="best ao5" value={fmt(stats.bestAo5)} />
        <Stat label="best ao12" value={fmt(stats.bestAo12)} />
        <Stat label="worst" value={fmt(stats.worst)} />
        <Stat label="solves" value={String(stats.count)} note={scope === "all" ? "· all sessions" : undefined} />
      </div>
      {solves.length >= 2 && (
        <div className="mt-2 border-t border-border/60 pt-2 lg:mt-4 lg:pt-3">
          <SolveTrendChart solves={solves} />
        </div>
      )}
    </div>
  );
}
