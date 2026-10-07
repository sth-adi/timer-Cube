"use client";

import { useMemo } from "react";
import { Split, TrendingDown, TrendingUp } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { PHASE_LABELS, type PhaseCount } from "@/lib/store/settingsStore";
import { computePhaseSplits, normalSolves } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { PHASE_TINTS } from "./phaseTints";
import { stepStats, type StepStatsReport } from "@/lib/analysis/stepStats";
import { cn } from "@/lib/utils/cn";


const labelsFor = (count: number) => PHASE_LABELS[(count as PhaseCount)] ?? [];

export function PhaseSplitsCard() {
  const solves = useSessionStore((s) => s.solves);
  const summary = useMemo(() => computePhaseSplits(normalSolves(solves), labelsFor), [solves]);
  // Smart-cube solves carry every turn's time, so their steps can say far more than hand-marked splits.
  const smart = useMemo(() => stepStats(normalSolves(solves)), [solves]);

  if (smart) return <SmartSteps report={smart} />;
  if (!summary) return null;

  return (
    <div className="card rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Split size={14} className="text-accent" />
          Where your time goes
        </h3>
        <span className="text-[11px] text-muted-2">
          {summary.sampleSize} split solve{summary.sampleSize === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mb-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {summary.phases.map((phase, i) => (
          <div
            key={phase.label}
            className={PHASE_TINTS[i % PHASE_TINTS.length]}
            style={{ width: `${phase.share * 100}%` }}
            title={`${phase.label} — ${Math.round(phase.share * 100)}%`}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        {summary.phases.map((phase, i) => (
          <div key={phase.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${PHASE_TINTS[i % PHASE_TINTS.length]}`} />
            <span className="flex-1 truncate text-muted">{phase.label}</span>
            <span className="tabular-timer w-14 text-right font-medium">{formatTime(phase.meanMs)}</span>
            <span className="w-9 text-right text-muted-2">{Math.round(phase.share * 100)}%</span>
            <span className="tabular-timer w-14 text-right text-success/80" title="Your fastest for this phase">
              {formatTime(phase.bestMs)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
        Mean, share of the solve, then your best for that phase. The gap between the mean and the best is what
        consistency is worth — it&apos;s already inside your hands.
      </p>
    </div>
  );
}

const signed = (ms: number) => `${ms < 0 ? "−" : "+"}${formatTime(Math.abs(ms))}`;

/** A step's time across its recent solves — so "vs last" (one number) sits next to the shape it's a summary of. */
function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 56;
  const h = 14;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible text-muted-2" role="img" aria-label={`This step's time over your last ${values.length} solves`}>
      <title>{`Last ${values.length} solves: ${formatTime(values[0])} → ${formatTime(values[values.length - 1])}`}</title>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The four CFOP steps from your smart-cube solves: mean, current ao12 and
 * best for each, how much of each is looking against turning, and how
 * today's sitting compares with the last one.
 */
function SmartSteps({ report }: { report: StepStatsReport }) {
  const { steps, sampleSize, sittings } = report;
  // The step where looking costs you the most, called out below the rows.
  const lookiest = [...steps].filter((s) => s.label !== "Cross").sort((a, b) => b.lookMs - a.lookMs)[0];
  return (
    <div className="card rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Split size={14} className="text-accent" />
          Where your time goes
        </h3>
        <span className="text-[11px] text-muted-2">
          {sampleSize} smart solve{sampleSize === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mb-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {steps.map((st, i) => (
          <div key={st.label} className={PHASE_TINTS[i]} style={{ width: `${st.share * 100}%` }} title={`${st.label} — ${Math.round(st.share * 100)}%`} />
        ))}
      </div>

      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-2">
        <span className="w-2 shrink-0" />
        <span className="flex-1">Step</span>
        <span className="w-12 text-right">Mean</span>
        <span className="w-12 text-right">ao12</span>
        <span className="w-12 text-right">Best</span>
        {sittings && <span className="w-14 text-right">vs last</span>}
        <span className="w-14 shrink-0" />
      </div>
      <div className="space-y-2">
        {steps.map((st, i) => {
          const look = st.meanMs > 0 ? st.lookMs / st.meanMs : 0;
          return (
            <div key={st.label}>
              <div className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PHASE_TINTS[i]}`} />
                <span className="flex-1 truncate text-muted">
                  {st.label} <span className="text-muted-2">{Math.round(st.share * 100)}%</span>
                </span>
                <span className="tabular-timer w-12 text-right font-medium">{formatTime(st.meanMs)}</span>
                <span className="tabular-timer w-12 text-right text-muted">{st.ao12Ms !== null ? formatTime(st.ao12Ms) : "—"}</span>
                <span className="tabular-timer w-12 text-right text-success/80">{formatTime(st.bestMs)}</span>
                {sittings && (
                  <span
                    className={cn(
                      "tabular-timer flex w-14 items-center justify-end gap-0.5 text-right",
                      st.deltaMs === null || Math.abs(st.deltaMs) < 50 ? "text-muted-2" : st.deltaMs < 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {st.deltaMs !== null && Math.abs(st.deltaMs) >= 50 && (st.deltaMs < 0 ? <TrendingDown size={10} /> : <TrendingUp size={10} />)}
                    {st.deltaMs !== null ? signed(st.deltaMs) : "—"}
                  </span>
                )}
                <Sparkline values={st.trend} />
              </div>
              {i > 0 && st.meanMs > 0 && (
                <div className="ml-4 mt-1 flex items-center gap-2 text-[11px] text-muted-2">
                  <span className="flex h-1 w-20 shrink-0 overflow-hidden rounded-full bg-bg-panel-2" aria-hidden>
                    <span className="bg-warning/70" style={{ width: `${look * 100}%` }} />
                    <span className="bg-foreground/30" style={{ width: `${(1 - look) * 100}%` }} />
                  </span>
                  <span>
                    looking {formatTime(st.lookMs)} · turning {formatTime(st.turnMs)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
        {lookiest && lookiest.lookMs >= 300 && (
          <>
            You spend {formatTime(lookiest.lookMs)} looking before you start turning in {lookiest.label === "F2L" ? "F2L (across its four pairs)" : lookiest.label} — {Math.round((lookiest.lookMs / lookiest.meanMs) * 100)}% of the step.{" "}
          </>
        )}
        {sittings
          ? `“vs last” is this sitting's ${sittings.current} solves against the ${sittings.previous} of your previous one.`
          : "Mean, ao12 (your latest 12) and best at each step."}{" "}
        The little line is that step&apos;s time across your recent solves.
      </p>
    </div>
  );
}
