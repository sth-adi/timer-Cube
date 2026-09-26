"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Flag, Minus, Plus } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { PHASE_COLOR, SectionTitle } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, defaultTargetMs, planGoal, typicalSolveMs, type Reach } from "@/lib/analysis/goalPlanner";
import { cn } from "@/lib/utils/cn";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const REACH: Record<Reach, { label: string; tone: string }> = {
  already: { label: "Already there", tone: "bg-accent/15 text-accent" },
  "good-days": { label: "Consistency gets you there", tone: "bg-accent/15 text-accent" },
  "best-days": { label: "Needs best-day phases", tone: "bg-warning/15 text-warning" },
  beyond: { label: "Needs new skill", tone: "bg-warning/15 text-warning" },
};

/**
 * Goal Planner: pick a target average and get a phase-by-phase budget for
 * it, drawn only from what you already do on good days.
 */
export default function GoalPage() {
  const metrics = useSolveMetrics();
  const typical = useMemo(() => (metrics.length ? typicalSolveMs(metrics) : 0), [metrics]);
  const [target, setTarget] = useState<number | null>(null);
  const targetMs = target ?? defaultTargetMs(typical);
  const plan = useMemo(() => planGoal(metrics, targetMs), [metrics, targetMs]);
  const step = (d: number) => setTarget(Math.max(1000, targetMs + d));

  return (
    <AnalyticsShell icon={<Flag size={17} className="text-accent" />} title="Goal Planner" subtitle="Pick a target — get a phase-by-phase budget from your own good days.">
      {!plan ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="Goal Planner" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-2 rounded-xl p-5 text-center">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => step(-500)} aria-label="Lower target by half a second" className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-panel-2 text-foreground">
                <Minus size={16} />
              </button>
              <p className="w-32 text-4xl font-bold tabular-nums text-foreground">{(targetMs / 1000).toFixed(1)}s</p>
              <button type="button" onClick={() => step(500)} aria-label="Raise target by half a second" className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-panel-2 text-foreground">
                <Plus size={16} />
              </button>
            </div>
            <p className="text-[11px] text-muted-2">target · your typical solve is {secs(plan.currentMs)}</p>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", REACH[plan.reach].tone)}>{REACH[plan.reach].label}</span>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{plan.headline}</p>
          <Link href="/journey" className="card flex items-center justify-between rounded-xl px-4 py-3 text-[12px] font-semibold text-foreground hover:text-accent">
            Turn a goal into a week-by-week Training Journey <ChevronRight size={14} className="text-muted-2" />
          </Link>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Phase budget</SectionTitle>
            {plan.phases.map((p) => {
              const max = p.medianMs * 1.05;
              const pos = (ms: number) => `${Math.max(0, Math.min(100, (ms / max) * 100))}%`;
              return (
                <div key={p.phase} className="flex flex-col gap-1">
                  <p className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PHASE_COLOR[p.phase] }} />
                      {p.phase}
                    </span>
                    <span className="tabular-nums text-muted-2">
                      {secs(p.medianMs)} → <span className={cn(p.cutMs > 0 ? "font-semibold text-foreground" : "")}>{secs(p.targetMs)}</span>
                      {p.cutMs > 0 && <span className="text-accent"> (−{secs(p.cutMs)})</span>}
                    </span>
                  </p>
                  <div className="relative h-3 rounded bg-bg-panel-2">
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: pos(p.targetMs), background: PHASE_COLOR[p.phase], opacity: 0.7 }} />
                    <span className="absolute inset-y-[-2px] w-0.5 bg-foreground/70" style={{ left: pos(p.goodMs) }} title="good day" />
                    <span className="absolute inset-y-[-2px] w-0.5 bg-foreground/35" style={{ left: pos(p.bestMs) }} title="best day" />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-2">
              Bar = the phase&apos;s target. Bright tick = your good day (25th percentile), faint tick = your best days (10th). The gap goes to the phase with the most room first.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
