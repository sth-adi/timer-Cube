"use client";

import { useMemo } from "react";
import { Split } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { PHASE_LABELS, type PhaseCount } from "@/lib/store/settingsStore";
import { computePhaseSplits, normalSolves } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

/** Distinct hues per phase, so the bar and the rows below read as one thing. */
const PHASE_TINTS = ["bg-accent", "bg-cyan", "bg-warning", "bg-success"];

const labelsFor = (count: number) => PHASE_LABELS[(count as PhaseCount)] ?? [];

export function PhaseSplitsCard() {
  const solves = useSessionStore((s) => s.solves);
  const summary = useMemo(() => computePhaseSplits(normalSolves(solves), labelsFor), [solves]);

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

      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-bg-panel-2">
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
