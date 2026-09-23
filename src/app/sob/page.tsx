"use client";

import { useMemo, useState } from "react";
import { Medal } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildSumOfBest, type SumOfBestReport } from "@/lib/analytics/sumOfBest";
import { secs } from "@/lib/analytics/solveMetrics";
import { cn } from "@/lib/utils/cn";

const ago = (date: number) => {
  if (!date) return "never";
  const d = Math.floor((Date.now() - date) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** Per stretch: the solid bar is your best, the faint extension up to your median is time you've proven you can save. */
function Stretches({ r }: { r: SumOfBestReport }) {
  const { ref, tip, bind } = useChartTip();
  const max = Math.max(...r.segments.map((s) => s.medianMs), 1);
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      {r.segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-[11px] text-muted">{s.label}</span>
          <div
            {...bind({ value: `${secs(s.bestMs)} best`, label: `${s.label}: typically ${secs(s.medianMs)}`, detail: `set ${ago(s.bestDate)} · ${s.golds} gold${s.golds === 1 ? "" : "s"}` })}
            className="relative h-4 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent/25" style={{ width: `${(s.medianMs / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent" style={{ width: `${(s.bestMs / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums">
            <span className="font-semibold text-foreground">{secs(s.bestMs)}</span>
            <span className="text-muted-2"> · −{secs(s.possibleSaveMs)}</span>
          </span>
        </div>
      ))}
      <ChartTip tip={tip} />
    </div>
  );
}

/** Gold stretches in each solve, oldest to newest. */
function GoldTimeline({ golds }: { golds: number[] }) {
  const max = Math.max(1, ...golds);
  return (
    <div className="flex h-10 items-end gap-px">
      {golds.map((g, i) => (
        <div key={i} className={cn("flex-1 rounded-t-[2px]", g ? "bg-warning" : "bg-bg-panel-2")} style={{ height: g ? `${(g / max) * 100}%` : "8%" }} title={`${g} gold${g === 1 ? "" : "s"}`} />
      ))}
    </div>
  );
}

/**
 * Sum of Best: your best-ever time on every stretch of a solve, added up —
 * a solve you've already proven you can do, just never all at once.
 */
export default function SumOfBestPage() {
  const metrics = useSolveMetrics();
  const [countSkips, setCountSkips] = useState(false);
  const r = useMemo(() => buildSumOfBest(metrics, countSkips), [metrics, countSkips]);
  return (
    <AnalyticsShell
      icon={<Medal size={17} className="text-accent" />}
      title="Sum of Best"
      subtitle="Your best-ever cross, pairs, OLL and PLL, added up: the solve you've already proven you can do."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="Sum of Best" />
      ) : (
        <>
          <Hero value={secs(r.sumOfBestMs)} label="sum of your best stretches" sub={`PB ${secs(r.pbMs)} — ${secs(r.headroomMs)} of proven headroom`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Every stretch: best, and what it could save</SectionTitle>
            </div>
            <Stretches r={r} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm bg-accent" /> best ever
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm bg-accent/25" /> up to your median
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-muted">
                <input type="checkbox" checked={countSkips} onChange={(e) => setCountSkips(e.target.checked)} className="accent-[var(--accent)]" />
                count OLL/PLL skips as bests
              </label>
            </div>
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Golds — a stretch faster than ever before</SectionTitle>
            <GoldTimeline golds={r.goldsPerSolve} />
            <p className="text-[11px] text-muted">
              {r.goldsPerSolve.reduce((a, b) => a + b, 0)} golds over {r.solves} solves
              {r.lastGold ? ` · last: ${r.lastGold.label}, ${ago(r.lastGold.date)}` : ""}.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
