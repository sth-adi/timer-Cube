"use client";

import { useMemo } from "react";
import { Clover } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildLuck, type LuckReport, type LuckSolve } from "@/lib/analytics/luck";
import { secs } from "@/lib/analytics/solveMetrics";
import { cn } from "@/lib/utils/cn";

const signed = (ms: number) => `${ms < 0 ? "−" : "+"}${secs(Math.abs(ms))}`;

/** How lucky your scrambles have been: a histogram of luck, lucky to the left, unlucky to the right. */
function LuckHistogram({ r }: { r: LuckReport }) {
  const { ref, tip, bind } = useChartTip();
  const bins = 13;
  const span = Math.max(300, ...r.solves.map((s) => Math.abs(s.luckMs)));
  const width = (2 * span) / bins;
  const counts = Array.from({ length: bins }, (_, b) => {
    const lo = -span + b * width;
    return { lo, hi: lo + width, n: r.solves.filter((s) => s.luckMs >= lo && (s.luckMs < lo + width || (b === bins - 1 && s.luckMs <= span))).length };
  });
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <div className="flex h-20 items-end gap-[2px]">
        {counts.map((c, i) => {
          const mid = (c.lo + c.hi) / 2;
          return (
            <div
              key={i}
              {...bind({ value: `${c.n} solve${c.n === 1 ? "" : "s"}`, label: `luck ${signed(c.lo)} to ${signed(c.hi)}` })}
              className="flex-1 rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{
                height: `${Math.max(c.n ? 6 : 0, (c.n / max) * 100)}%`,
                background: Math.abs(mid) < width / 2 ? "var(--muted-2)" : mid < 0 ? "var(--success)" : "var(--warning)",
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] tabular-nums text-muted-2">
        <span>{signed(-span)} lucky</span>
        <span>average scramble</span>
        <span>unlucky {signed(span)}</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

function Board({ title, list, by }: { title: string; list: LuckSolve[]; by: "raw" | "earned" }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">{title}</p>
      {list.slice(0, 5).map((s, i) => (
        <div key={s.id} className="flex items-baseline justify-between rounded-lg bg-bg-panel-2 px-2 py-1.5">
          <span className="text-[10px] text-muted-2">{i + 1}.</span>
          <span className="text-[12px] font-semibold tabular-nums text-foreground">{secs(by === "raw" ? s.totalMs : s.earnedMs)}</span>
          <span className={cn("text-[10px] tabular-nums", s.luckMs < -100 ? "text-success" : s.luckMs > 100 ? "text-warning" : "text-muted-2")}>
            {by === "raw" ? `luck ${signed(s.luckMs)}` : `was ${secs(s.totalMs)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Luck Meter: a model of your own solves separates what the scramble gave
 * you from what you did with it — then ranks your solves by the part you earned.
 */
export default function LuckPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildLuck(metrics), [metrics]);
  return (
    <AnalyticsShell
      icon={<Clover size={17} className="text-accent" />}
      title="Luck Meter"
      subtitle="How much of each solve was the scramble — and your solves ranked by the part you earned."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="The Luck Meter" />
      ) : (
        <>
          <Hero value={`±${secs(r.luckSpreadMs)}`} label="how much scramble luck typically moves a solve" sub={`fitted to your ${r.solves.length} smart-cube solves, allowing for how much you've improved`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>What the scramble is worth, for you</SectionTitle>
            {r.factors.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="text-[11px] text-foreground">{f.label}</span>
                {f.unclear ? (
                  <span className="text-[11px] text-muted-2">no clear effect yet ({signed(f.msPerUnit)})</span>
                ) : (
                  <span className={cn("text-[12px] font-semibold tabular-nums", f.msPerUnit < 0 ? "text-success" : "text-foreground")}>{signed(f.msPerUnit)}</span>
                )}
              </div>
            ))}
            <p className="text-[10px] text-muted-2">Fitted to your own times; factors that never varied in your history (say, you&apos;ve never had an OLL skip) are left out.</p>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Luck across all your solves</SectionTitle>
            <LuckHistogram r={r} />
            {Math.abs(r.recentLuckMs) > 50 && (
              <p className="text-[11px] text-muted">
                Your last 12 averaged {signed(r.recentLuckMs)} of luck.
              </p>
            )}
          </div>

          <div className="card grid grid-cols-2 gap-3 rounded-xl p-4">
            <Board title="Fastest, as timed" list={r.byRaw} by="raw" />
            <Board title="Fastest, luck removed" list={r.byEarned} by="earned" />
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
