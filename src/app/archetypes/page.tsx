"use client";

import { useMemo } from "react";
import { Shapes } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { Hero, PHASE_COLOR, PhaseLegend } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildArchetypes, type Archetype } from "@/lib/analytics/archetypes";
import { PHASES, secs } from "@/lib/analytics/solveMetrics";
import { cn } from "@/lib/utils/cn";

function ArchetypeCard({ a, maxMs }: { a: Archetype; maxMs: number }) {
  const total = a.phases.reduce((x, y) => x + y, 0);
  return (
    <div className="card flex flex-col gap-2.5 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{a.name}</p>
        <p className="text-[11px] text-muted">
          <span className="font-semibold text-foreground">{Math.round(a.share * 100)}%</span> of solves · {secs(a.meanMs)} avg
        </p>
      </div>
      <p className="text-[11px] text-muted-2">{a.blurb}</p>
      {/* Its average solve, phase by phase, on a scale shared by every card so lengths compare. */}
      <div className="flex h-4 gap-[2px]" style={{ width: `${(total / maxMs) * 100}%` }}>
        {a.phases.map((p, k) => (
          <div
            key={PHASES[k]}
            title={`${PHASES[k]} ${secs(p)}`}
            style={{
              flexGrow: p,
              background: PHASE_COLOR[PHASES[k]],
              borderRadius: k === 0 ? "4px 0 0 4px" : k === 3 ? "0 4px 4px 0" : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted">
        {a.phases.map((p, k) => (
          <span key={k}>
            {PHASES[k]} {secs(p)}
          </span>
        ))}
        <span>paused {Math.round(a.pauseShare * 100)}%</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-2">
          {Math.round(a.shareEarly * 100)}% of older solves → <span className="font-semibold text-foreground">{Math.round(a.shareLate * 100)}%</span> of recent
        </span>
        <span className={cn("font-semibold tabular-nums", a.costMs > 0 ? "text-warning" : "text-success")}>
          {a.costMs > 0 ? "+" : "−"}
          {secs(Math.abs(a.costMs))} on your average
        </span>
      </div>
    </div>
  );
}

/**
 * Solve Archetypes: k-means over each solve's shape (phase shares and time
 * paused) finds the handful of ways your solves go — and what each costs.
 */
export default function ArchetypesPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildArchetypes(metrics), [metrics]);
  const maxMs = r ? Math.max(...r.archetypes.map((a) => a.phases.reduce((x, y) => x + y, 0))) : 1;
  return (
    <AnalyticsShell
      icon={<Shapes size={17} className="text-accent" />}
      title="Solve Archetypes"
      subtitle="The handful of shapes your solves actually come in, found by clustering — and what each one costs you."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="Solve Archetypes" />
      ) : (
        <>
          <Hero value={`${r.archetypes.length}`} label="kinds of solve in your history" sub={`${r.solves} smart-cube solves · overall average ${secs(r.overallMs)}`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>
          <div className="px-1">
            <PhaseLegend />
          </div>
          {r.archetypes.map((a) => (
            <ArchetypeCard key={a.name} a={a} maxMs={maxMs} />
          ))}
          <p className="px-1 text-[10px] text-muted-2">
            Grouped by shape, not speed: what share of each solve went to each phase and to pausing, standardised and clustered (k-means, k = 4). Names come from
            what sets each group apart from your average solve.
          </p>
        </>
      )}
    </AnalyticsShell>
  );
}
