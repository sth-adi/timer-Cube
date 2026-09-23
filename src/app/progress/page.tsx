"use client";

import { useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { AnalyticsShell, NotEnough, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { Hero, PHASE_COLOR, SectionTitle } from "@/components/analytics/ChartKit";
import { MIN_SOLVES, buildProgress, rollingMean, type PhaseProgress, type ProgressReport } from "@/lib/analytics/progress";
import { secs } from "@/lib/analytics/solveMetrics";
import { cn } from "@/lib/utils/cn";

const W = 320;
const H = 170;
const PAD = { l: 34, r: 8, t: 10, b: 20 };

/**
 * Every solve (faint dots), your rolling average of 12 (the line), and the
 * fitted learning curve carried on into the future (dashed — a projection),
 * with your next goal as a hairline. A crosshair snaps to the nearest solve.
 */
function CurveChart({ r }: { r: ProgressReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const n = r.totals.length;
  const horizon = Math.round(n * 1.5);
  const fit = (i: number) => r.overall.c * (i + 1) ** -r.overall.p;
  const ys = [...r.totals.slice(Math.floor(n * 0.1)), ...r.rolling, r.forecast?.goalMs ?? Infinity].filter(Number.isFinite);
  const yMin = Math.min(...ys) * 0.92;
  const yMax = Math.max(...r.rolling, ...r.totals.slice(-Math.ceil(n * 0.9))) * 1.05;
  const x = (i: number) => PAD.l + (i / Math.max(1, horizon - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3].map((k) => yMin + ((yMax - yMin) * k) / 3);
  const rollPath = r.rolling.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fitPath = Array.from({ length: horizon - n + 1 }, (_, k) => n - 1 + k)
    .map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(fit(i)).toFixed(1)}`)
    .join(" ");

  const onMove = (e: React.PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (horizon - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Solve times over ${n} solves with a fitted learning curve`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={8} fill="var(--muted-2)">
              {(t / 1000).toFixed(1)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize={8} fill="var(--muted-2)">
          solve 1
        </text>
        <text x={x(n - 1)} y={H - 6} fontSize={8} textAnchor="middle" fill="var(--muted-2)">
          now ({n})
        </text>
        {r.forecast && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r.forecast.goalMs)} y2={y(r.forecast.goalMs)} stroke="var(--success)" strokeWidth={1} />
            <text x={W - PAD.r} y={y(r.forecast.goalMs) - 3} textAnchor="end" fontSize={8} fill="var(--muted)">
              goal {secs(r.forecast.goalMs, 0)}
            </text>
          </g>
        )}
        {r.totals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={1.6} fill="var(--muted-2)" opacity={0.45} />
        ))}
        <path d={fitPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" opacity={0.7} />
        <path d={rollPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(r.rolling[n - 1])} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(r.rolling[hover])} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 flex flex-col rounded-lg border border-border-strong bg-bg-elevated px-2.5 py-1.5 shadow-lg"
          style={{ left: `${Math.min(62, (x(hover) / W) * 100)}%` }}
        >
          <span className="text-sm font-bold text-foreground">{secs(r.rolling[hover])}</span>
          <span className="text-[10px] text-muted">avg of 12 at solve {hover + 1}</span>
          <span className="text-[10px] text-muted-2">that solve: {secs(r.totals[hover])}</span>
        </div>
      )}
    </div>
  );
}

/** One phase's rolling average as a small multiple, with its improvement rate. */
function PhaseMini({ p }: { p: PhaseProgress }) {
  const roll = useMemo(() => rollingMean(p.series), [p.series]);
  const w = 140;
  const h = 44;
  const lo = Math.min(...roll);
  const hi = Math.max(...roll);
  const path = roll
    .map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, roll.length - 1)) * (w - 4) + 2).toFixed(1)},${(2 + (1 - (v - lo) / Math.max(1, hi - lo)) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-bg-panel-2 p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[p.phase] }} />
          {p.phase}
        </span>
        <span className="text-[11px] font-semibold text-foreground">{secs(p.current)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${p.phase} rolling average`}>
        <path d={path} fill="none" stroke={PHASE_COLOR[p.phase]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className={cn("self-start rounded-full px-2 py-0.5 text-[10px] font-medium", p.plateau ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
        {p.plateau ? "⏸ stalled lately" : `▼ ${(p.per100 * 100).toFixed(1)}% per 100 solves`}
      </span>
    </div>
  );
}

/**
 * Progress Forecast: power-law learning curves fitted to your own history —
 * how fast you're improving, which phases have stalled, and when you'd
 * reach your next goal at this rate.
 */
export default function ProgressPage() {
  const metrics = useSolveMetrics();
  const r = useMemo(() => buildProgress(metrics), [metrics]);
  const f = r?.forecast ?? null;
  return (
    <AnalyticsShell
      icon={<TrendingUp size={17} className="text-accent" />}
      title="Progress Forecast"
      subtitle="Learning curves fitted to your own solves — what's improving, what's stalled, and when you'll hit your next goal."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={metrics.length} what="The forecast" />
      ) : (
        <>
          {f && f.solvesNeeded !== null && !r.overall.plateau ? (
            <Hero
              value={`sub-${secs(f.goalMs, 0)}`}
              label={`in about ${f.solvesNeeded.toLocaleString()} more solves${f.daysNeeded !== null ? ` · ~${f.daysNeeded} day${f.daysNeeded === 1 ? "" : "s"} at your pace` : ""}`}
              sub={`Average of 12 now ${secs(r.overall.current)} · ${r.solvesPerDay.toFixed(0)} solves a day recently`}
            />
          ) : (
            <Hero
              value={secs(r.overall.current)}
              label="your current average of 12"
              sub={f ? `At the current rate the curve isn't heading for sub-${secs(f.goalMs, 0)} — something in your practice has to change.` : undefined}
            />
          )}
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Your learning curve</SectionTitle>
            <CurveChart r={r} />
            <div className="flex flex-wrap gap-3 text-[10px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-accent" /> average of 12
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed border-accent opacity-70" /> fitted curve, projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted-2)" }} /> each solve
              </span>
            </div>
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Each phase on its own</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {r.phases.map((p) => (
                <PhaseMini key={p.phase} p={p} />
              ))}
            </div>
            <p className="text-[10px] text-muted-2">
              Rates come from a power-law fit (time ≈ C·n⁻ᵖ) over all {r.solves} solves; &quot;stalled&quot; means your most recent stretch isn&apos;t trending down by more than
              its own noise.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
