"use client";

import { useMemo } from "react";
import { Scale } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, PHASE_COLOR, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildAutopsy, type Autopsy, type Factor } from "@/lib/analytics/autopsy";
import { secs } from "@/lib/analytics/solveMetrics";
import { cn } from "@/lib/utils/cn";

const sizeWord = (d: number) => (Math.abs(d) >= 0.8 ? "large" : Math.abs(d) >= 0.5 ? "medium" : Math.abs(d) >= 0.2 ? "small" : "none");

/** How the fast-vs-slow gap splits across phases: one bar per phase from a shared zero line. */
function GapChart({ a }: { a: Autopsy }) {
  const { ref, tip, bind } = useChartTip();
  const max = Math.max(1, ...a.phaseGap.map((p) => Math.abs(p.ms)));
  const hasNeg = a.phaseGap.some((p) => p.ms < 0);
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      {a.phaseGap.map((p) => {
        const w = (Math.abs(p.ms) / max) * (hasNeg ? 50 : 100);
        return (
          <div key={p.phase} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[11px] text-muted">{p.phase}</span>
            <div className="relative h-5 flex-1">
              {hasNeg && <span className="absolute left-1/2 top-0 h-full w-px bg-border-strong" />}
              <div
                {...bind({ value: `${p.ms >= 0 ? "+" : "−"}${secs(Math.abs(p.ms))}`, label: `${p.phase}: slow − fast`, detail: `${Math.round((p.ms / Math.max(1, a.gapMs)) * 100)}% of the gap` })}
                className="absolute top-0.5 h-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{
                  width: `${Math.max(0.5, w)}%`,
                  left: hasNeg ? (p.ms >= 0 ? "50%" : `${50 - w}%`) : 0,
                  background: PHASE_COLOR[p.phase],
                  borderRadius: p.ms >= 0 ? "0 4px 4px 0" : "4px 0 0 4px",
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {p.ms >= 0 ? "+" : "−"}
              {secs(Math.abs(p.ms))}
            </span>
          </div>
        );
      })}
      <ChartTip tip={tip} />
    </div>
  );
}

/** Every factor, ranked by effect size: the bar is |d|, the text says which way it went. */
function FactorChart({ factors }: { factors: Factor[] }) {
  const { ref, tip, bind } = useChartTip();
  return (
    <div ref={ref} className="relative flex flex-col gap-2.5">
      {factors.map((f) => {
        const worseWhenSlow = f.higherIsBetter ? f.slow < f.fast : f.slow > f.fast;
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-foreground">
                {f.label}
                {f.family === "luck" && <span className="ml-1.5 rounded bg-bg-panel-2 px-1 py-px text-[9px] font-medium uppercase text-muted-2">luck</span>}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {f.format(f.fast)} <span className="text-muted-2">→</span> <span className="font-semibold text-foreground">{f.format(f.slow)}</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-panel-2">
              <div
                {...bind({
                  value: `d = ${f.d >= 0 ? "+" : ""}${f.d.toFixed(2)}`,
                  label: `${sizeWord(f.d)} effect · fast ${f.format(f.fast)}, slow ${f.format(f.slow)}`,
                  detail: worseWhenSlow ? "worse in your slow solves" : "not worse in your slow solves",
                })}
                className="h-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{ width: `${Math.max(2, (Math.abs(f.d) / 3) * 100)}%`, background: f.family === "luck" ? "var(--muted-2)" : "var(--accent)", opacity: worseWhenSlow ? 1 : 0.45 }}
              />
            </div>
          </div>
        );
      })}
      <ChartTip tip={tip} />
    </div>
  );
}

/**
 * Fast vs Slow Autopsy: your fastest quarter of smart-cube solves against
 * your slowest, on every measurable thing — so you know whether a bad
 * solve was your hands, your eyes, or the scramble.
 */
export default function AutopsyPage() {
  const metrics = useSolveMetrics();
  const a = useMemo(() => buildAutopsy(metrics), [metrics]);
  return (
    <AnalyticsShell
      icon={<Scale size={17} className="text-accent" />}
      title="Fast vs Slow Autopsy"
      subtitle="Your fastest quarter of solves against your slowest — what actually separates them."
    >
      {!a ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="The autopsy" />
      ) : (
        <>
          <Hero value={`+${secs(a.gapMs)}`} label={`slowest ${a.groupSize} solves vs fastest ${a.groupSize}`} sub={`${secs(a.fastMean)} average when it goes well · ${secs(a.slowMean)} when it doesn't`} />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{a.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Where the gap comes from</SectionTitle>
            <GapChart a={a} />
            <p className="text-[10px] text-muted-2">Each phase&apos;s average in your slow solves minus your fast ones. They add up to the whole gap.</p>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <div className="flex items-baseline justify-between">
              <SectionTitle>What separates them, biggest first</SectionTitle>
              <span className="text-[10px] text-muted-2">fast → slow</span>
            </div>
            <div className="flex gap-3 text-[10px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-accent" /> you control it
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full" style={{ background: "var(--muted-2)" }} /> scramble luck
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-accent opacity-45" /> better when slow
              </span>
            </div>
            <FactorChart factors={a.factors} />
            <p className="text-[10px] text-muted-2">Bar length is the effect size (Cohen&apos;s d): the difference relative to how much it normally varies. Past 0.8 is large.</p>
          </div>

          <div className={cn("card rounded-xl p-4 text-[12px]", a.factors.some((f) => f.family === "luck" && Math.abs(f.d) >= 0.5) ? "text-foreground" : "text-success")}>
            {a.luckVerdict}
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
