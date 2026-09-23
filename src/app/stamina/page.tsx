"use client";

import { useMemo } from "react";
import { Thermometer } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { ChartTip, Hero, PHASE_COLOR, SectionTitle, useChartTip } from "@/components/analytics/ChartKit";
import { MIN_SITTING, buildStamina, type BucketStat } from "@/lib/analytics/stamina";

const pct = (v: number | null, signed = true) => (v === null ? "—" : `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`);

/**
 * Columns from a zero line: slower than your sitting median goes up in the
 * warning color, faster goes down in the success color — sign is also in
 * the label, so it never rests on color alone.
 */
function DeltaColumns({ buckets, highlight }: { buckets: BucketStat[]; highlight?: (b: BucketStat, i: number) => boolean }) {
  const { ref, tip, bind } = useChartTip();
  const max = Math.max(0.05, ...buckets.map((b) => Math.abs(b.rel ?? 0)));
  const H = 64;
  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <div className="relative flex items-center gap-[2px]" style={{ height: H * 2 }}>
        <span className="absolute left-0 right-0 top-1/2 h-px bg-border-strong" />
        {buckets.map((b, i) => {
          const v = b.rel ?? 0;
          const h = (Math.abs(v) / max) * (H - 14);
          const label = highlight?.(b, i);
          return (
            <div key={b.label} className="relative flex h-full flex-1 justify-center">
              {b.count > 0 && (
                <div
                  {...bind({ value: pct(b.rel), label: `solve ${b.label} vs your sitting median`, detail: `${b.count} solves` })}
                  className="absolute w-full max-w-6 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  style={{
                    height: Math.max(2, h),
                    background: v > 0 ? "var(--warning)" : "var(--success)",
                    ...(v > 0 ? { bottom: "50%", borderRadius: "4px 4px 0 0" } : { top: "50%", borderRadius: "0 0 4px 4px" }),
                  }}
                />
              )}
              {label && b.count > 0 && (
                <span
                  className="absolute whitespace-nowrap text-[9px] font-semibold tabular-nums text-foreground"
                  style={v > 0 ? { bottom: `calc(50% + ${Math.max(2, h) + 2}px)` } : { top: `calc(50% + ${Math.max(2, h) + 2}px)` }}
                >
                  {pct(b.rel)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px]">
        {buckets.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[9px] tabular-nums text-muted-2">
            {b.label}
          </span>
        ))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/** Pause share by position: a single-series line (no legend needed — the title names it). */
function PauseLine({ buckets }: { buckets: BucketStat[] }) {
  const { ref, tip, bind } = useChartTip();
  const pts = buckets.map((b, i) => ({ i, v: b.pauseShare, b })).filter((p) => p.v !== null) as { i: number; v: number; b: BucketStat }[];
  const W = 300;
  const H = 70;
  const lo = Math.min(...pts.map((p) => p.v)) * 0.9;
  const hi = Math.max(...pts.map((p) => p.v)) * 1.05;
  const x = (i: number) => 10 + (i / (buckets.length - 1)) * (W - 20);
  const y = (v: number) => 6 + (1 - (v - lo) / Math.max(0.001, hi - lo)) * (H - 12);
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Share of each solve spent paused, by position in the sitting">
        <path d={pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p) => (
          <g key={p.i}>
            <circle cx={x(p.i)} cy={y(p.v)} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
            <circle
              {...bind({ value: `${Math.round(p.v * 100)}%`, label: `of solve ${p.b.label} spent paused`, detail: `${p.b.count} solves` })}
              cx={x(p.i)}
              cy={y(p.v)}
              r={12}
              fill="transparent"
              className="outline-none"
            />
          </g>
        ))}
        <text x={x(pts[0].i)} y={y(pts[0].v) - 8} fontSize={9} textAnchor="start" fill="var(--foreground)">
          {Math.round(pts[0].v * 100)}%
        </text>
        <text x={x(pts[pts.length - 1].i)} y={y(pts[pts.length - 1].v) - 8} fontSize={9} textAnchor="end" fill="var(--foreground)">
          {Math.round(pts[pts.length - 1].v * 100)}%
        </text>
      </svg>
      <div className="flex justify-between px-1 text-[9px] text-muted-2">
        {buckets.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/**
 * Warm-up & Fatigue: every solve measured against its own sitting's median,
 * averaged by where in the sitting it fell — your warm-up curve, your
 * coldest phase, whether you fade, and whether resting helps.
 */
export default function StaminaPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildStamina(metrics), [metrics]);
  return (
    <AnalyticsShell
      icon={<Thermometer size={17} className="text-accent" />}
      title="Warm-up & Fatigue"
      subtitle="How your solving changes across a sitting — how long you take to warm up, and when you start to fade."
    >
      {!r ? (
        <NotEnough need={3 * MIN_SITTING} have={metrics.length} what={`Warm-up & Fatigue (3 sittings of ${MIN_SITTING}+ solves)`} />
      ) : (
        <>
          <Hero
            value={r.warmupSolves === 5 ? "5+" : `${r.warmupSolves}`}
            label={r.warmupSolves === 0 ? "warm-up solves needed — you start at speed" : `warm-up solve${r.warmupSolves === 1 ? "" : "s"} before you're at full speed`}
            sub={`${r.solves} solves across ${r.sittings} sittings (a new sitting starts after 15+ minutes away)`}
          />
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Solve time by position in the sitting, vs that sitting&apos;s median</SectionTitle>
            <DeltaColumns buckets={r.positions} highlight={(b, i) => i < 3 || i === r.positions.length - 1 || (b.rel !== null && Math.abs(b.rel) === Math.max(...r.positions.map((x) => Math.abs(x.rel ?? 0))))} />
            <div className="flex gap-3 text-[10px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2.5 rounded-sm bg-warning" /> slower than usual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2.5 rounded-sm bg-success" /> faster than usual
              </span>
            </div>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Share of each solve spent paused, by position</SectionTitle>
            <PauseLine buckets={r.positions} />
            {r.fatigue !== null && (
              <p className="text-[11px] text-muted">
                Solves after #30 run {pct(r.fatigue)} against solves 6–30 {r.fatigue > 0.03 ? "— that's fatigue." : "— no real fade."}
              </p>
            )}
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Which phase is coldest (first 3 solves vs settled)</SectionTitle>
            {r.phaseCold.map((p) => {
              const max = Math.max(50, ...r.phaseCold.map((x) => Math.abs(x.ms)));
              return (
                <div key={p.phase} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] text-muted">{p.phase}</span>
                  <div className="h-2.5 flex-1 rounded-full bg-bg-panel-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1, (Math.max(0, p.ms) / max) * 100)}%`, background: PHASE_COLOR[p.phase] }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                    {p.ms >= 0 ? "+" : "−"}
                    {(Math.abs(p.ms) / 1000).toFixed(2)}s
                  </span>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-2">Extra time each phase takes in your first three solves of a sitting, compared with solves 6–20.</p>
          </div>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Does resting between solves help?</SectionTitle>
            <DeltaColumns buckets={r.rest} highlight={() => true} />
            <p className="text-[10px] text-muted-2">Rest is the time from finishing one solve to starting the next, within a sitting.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
