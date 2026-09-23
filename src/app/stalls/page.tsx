"use client";

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, PHASE_COLOR, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { BINS_PER_PHASE, MIN_SOLVES, buildStallMap, type StallMapReport } from "@/lib/analytics/stallMap";
import { PHASES, secs } from "@/lib/analytics/solveMetrics";

/** Sequential scale: one hue, from the empty-cell surface to full accent. */
const heat = (t: number) => (t <= 0 ? "var(--bg-panel-2)" : `color-mix(in srgb, var(--accent) ${Math.round(18 + t * 82)}%, var(--bg-panel-2))`);

function Heatmap({ r }: { r: StallMapReport }) {
  const { ref, tip, bind } = useChartTip();
  // Cap the scale at a high percentile so one huge pause doesn't wash out the rest.
  const all = r.rows.flat().filter((v) => v > 0).sort((a, b) => a - b);
  const cap = all.length ? all[Math.floor(all.length * 0.95)] : 1;
  const colMax = Math.max(1, ...r.columns);
  const where = (c: number) => `${PHASES[Math.floor(c / BINS_PER_PHASE)]}, ${Math.round(((c % BINS_PER_PHASE) / BINS_PER_PHASE) * 100)}–${Math.round((((c % BINS_PER_PHASE) + 1) / BINS_PER_PHASE) * 100)}% through`;
  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(4, 1fr)` }}>
        {PHASES.map((p) => (
          <div key={p} className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted">{p}</span>
            <span className="h-[3px] rounded-full" style={{ background: PHASE_COLOR[p] }} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        {r.rows.map((row, i) => (
          <div key={i} className="grid gap-px" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
            {row.map((v, c) => (
              <div key={c} className="h-[5px]" style={{ background: heat(Math.min(1, v / cap)), marginLeft: c % BINS_PER_PHASE === 0 && c ? 2 : 0 }} />
            ))}
          </div>
        ))}
      </div>
      <p className="text-[9px] text-muted-2">↑ oldest of your last {r.solves} solves · newest ↓</p>
      <div className="mt-1 grid h-12 items-end gap-px" style={{ gridTemplateColumns: `repeat(${r.columns.length}, 1fr)` }}>
        {r.columns.map((v, c) => (
          <div
            key={c}
            {...bind({ value: `${secs(v)} per solve`, label: where(c) })}
            className="rounded-t-[3px] bg-accent outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            style={{ height: `${Math.max(v > 0 ? 4 : 1, (v / colMax) * 100)}%`, marginLeft: c % BINS_PER_PHASE === 0 && c ? 2 : 0, opacity: v > 0 ? 1 : 0.2 }}
          />
        ))}
      </div>
      <p className="text-[9px] text-muted-2">Average pause time per solve at each point — each phase stretched to the same width.</p>
      <ChartTip tip={tip} />
    </div>
  );
}

/**
 * Stall Map: every pause in your recent solves, placed by how far through
 * its phase it happened — the spots where your lookahead reliably runs dry.
 */
export default function StallsPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildStallMap(metrics), [metrics]);
  const total = r ? r.byPhase.reduce((a, b) => a + b, 0) : 0;
  return (
    <AnalyticsShell
      icon={<Flame size={17} className="text-accent" />}
      title="Stall Map"
      subtitle="Where in the solve your pauses land, across your recent solves — the spots your lookahead runs dry."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="The Stall Map" />
      ) : (
        <>
          <Hero value={secs(total)} label="paused per solve, on average" sub={`last ${r.solves} smart-cube solves · a pause is a gap of 0.4s or more between turns`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Every pause, by where it happened</SectionTitle>
            <Heatmap r={r} />
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Your three worst spots</SectionTitle>
            {r.hotspots.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="flex items-center gap-2 text-[11px] text-foreground">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: PHASE_COLOR[h.phase] }} />
                  {h.where.charAt(0).toUpperCase() + h.where.slice(1)}
                </span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">{secs(h.ms)}</span>
              </div>
            ))}
            <div className="mt-1 grid grid-cols-4 gap-2 text-center">
              {PHASES.map((p, k) => (
                <div key={p} className="rounded-lg bg-bg-panel-2 py-1.5">
                  <p className="text-sm font-bold text-foreground">{secs(r.byPhase[k])}</p>
                  <p className="text-[10px] text-muted-2">in {p}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
