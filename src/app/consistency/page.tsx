"use client";

import { useMemo } from "react";
import { Sigma } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, PHASE_COLOR, PhaseLegend, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildConsistency, type ConsistencyReport } from "@/lib/analytics/consistency";
import { secs } from "@/lib/analytics/solveMetrics";

/** Share of total variance per phase, as one stacked bar (2px surface gaps between segments). */
function ShareBar({ r }: { r: ConsistencyReport }) {
  const { ref, tip, bind } = useChartTip();
  const positive = r.phases.filter((p) => p.share > 0);
  const sum = positive.reduce((a, p) => a + p.share, 0);
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      <div className="flex h-6 gap-[2px]">
        {positive.map((p, i) => (
          <div
            key={p.phase}
            {...bind({ value: `${Math.round(p.share * 100)}%`, label: `of your spread comes from ${p.phase}`, detail: `σ ${secs(p.sd)} on a ${secs(p.mean)} phase` })}
            className="h-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{
              flexGrow: p.share / sum,
              background: PHASE_COLOR[p.phase],
              borderRadius: `${i === 0 ? 4 : 0}px ${i === positive.length - 1 ? 4 : 0}px ${i === positive.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
            }}
          />
        ))}
      </div>
      <PhaseLegend values={Object.fromEntries(r.phases.map((p) => [p.phase, `${Math.round(p.share * 100)}%`]))} />
      <ChartTip tip={tip} />
    </div>
  );
}

/** Each phase's typical range (10th–90th percentile) with its median, on one shared time axis. */
function SpreadChart({ r }: { r: ConsistencyReport }) {
  const { ref, tip, bind } = useChartTip();
  const max = Math.max(...r.phases.map((p) => p.p90)) * 1.05;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      {r.phases.map((p) => (
        <div key={p.phase} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-muted">{p.phase}</span>
          <div className="relative h-6 flex-1">
            <span className="absolute left-0 right-0 top-1/2 h-px bg-border" />
            <div
              {...bind({ value: `${secs(p.p10)} – ${secs(p.p90)}`, label: `${p.phase}: middle 80% of your solves`, detail: `median ${secs(p.p50)} · σ ${secs(p.sd)}` })}
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{ left: `${(p.p10 / max) * 100}%`, width: `${Math.max(1, ((p.p90 - p.p10) / max) * 100)}%`, background: PHASE_COLOR[p.phase], opacity: 0.55 }}
            />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-panel"
              style={{ left: `${(p.p50 / max) * 100}%`, background: PHASE_COLOR[p.phase] }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-muted">±{Math.round(p.cv * 100)}% CV</span>
        </div>
      ))}
      <div className="ml-12 mr-[4.5rem] flex justify-between text-[9px] tabular-nums text-muted-2">
        {ticks.map((t) => (
          <span key={t}>{(t / 1000).toFixed(t < 10000 ? 1 : 0)}s</span>
        ))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/**
 * Consistency Lab: which phase your solve-to-solve spread actually comes
 * from, and what steadying it would be worth — computed on your own solves.
 */
export default function ConsistencyPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildConsistency(metrics), [metrics]);
  return (
    <AnalyticsShell
      icon={<Sigma size={17} className="text-accent" />}
      title="Consistency Lab"
      subtitle="Where your solve-to-solve spread comes from, phase by phase."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="Consistency Lab" />
      ) : (
        <>
          <Hero value={`±${secs(r.totalSd)}`} label={`solve-to-solve spread (σ) around your ${secs(r.totalMean)} mean`} sub={`${r.solves} smart-cube solves`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Share of your inconsistency</SectionTitle>
            <ShareBar r={r} />
            <p className="text-[10px] text-muted-2">
              Each phase&apos;s covariance with your total time — they add up to 100% of the variance. A phase that&apos;s long but steady scores low.
            </p>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>How much each phase wanders</SectionTitle>
            <SpreadChart r={r} />
            <p className="text-[10px] text-muted-2">Bars span your 10th to 90th percentile; the dot is the median. CV is the spread relative to the phase&apos;s own length.</p>
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>What steadying each phase would be worth</SectionTitle>
            {r.whatIf.filter((w) => w.phase !== r.steadiest).map((w) => (
              <div key={w.phase} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="flex items-center gap-2 text-[11px] text-foreground">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PHASE_COLOR[w.phase] }} />
                  {w.phase} as steady as your {r.steadiest}
                </span>
                {w.dropMs > 10 ? (
                  <span className="text-[11px] tabular-nums text-muted">
                    σ {secs(r.totalSd)} → <span className="font-semibold text-foreground">{secs(w.sd)}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-2">little to gain</span>
                )}
              </div>
            ))}
            <p className="text-[10px] text-muted-2">Replays your actual solves with that phase&apos;s wobble scaled down and everything else left as it happened.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
