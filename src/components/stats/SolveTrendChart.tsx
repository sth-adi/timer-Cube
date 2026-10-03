"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Solve } from "@/types";
import { comparableTime, rollingAverages } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const WIDTH = 560;
const HEIGHT = 176;
const PAD_L = 36;
const PAD_R = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 18;
const WINDOWS = [30, 100, 0] as const;

interface Point {
  /** Index within the visible window. */
  i: number;
  /** Solve number across the whole list (1-based) — what the tooltip names. */
  n: number;
  ms: number;
  /** A new best single when it happened. */
  pb: boolean;
}

/** A readable second-tick for an axis spanning [min, max] ms — three evenly spaced. */
function ticks(min: number, max: number): number[] {
  return [0, 0.5, 1].map((f) => min + (max - min) * f);
}

export function SolveTrendChart({ solves }: { solves: Solve[] }) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [windowSize, setWindowSize] = useState<(typeof WINDOWS)[number]>(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { raw, ao5, domain, count, bestMs } = useMemo(() => {
    const times = solves.map(comparableTime);
    const rolling = rollingAverages(solves, 5);
    // PB flags are decided against everything before, not just the visible window.
    let best = Infinity;
    const pbFlags = times.map((t) => {
      const pb = Number.isFinite(t) && t < best;
      if (pb) best = t;
      return pb;
    });
    const total = solves.length;
    const start = windowSize > 0 ? Math.max(0, total - windowSize) : 0;
    const rawPts: Point[] = [];
    const avgPts: Point[] = [];
    for (let k = start; k < total; k++) {
      const i = k - start;
      if (Number.isFinite(times[k])) rawPts.push({ i, n: k + 1, ms: times[k], pb: pbFlags[k] });
      const a = rolling[k];
      if (a !== null && Number.isFinite(a)) avgPts.push({ i, n: k + 1, ms: a, pb: false });
    }
    const all = [...rawPts, ...avgPts].map((p) => p.ms);
    const lo = all.length ? Math.min(...all) : 0;
    const hi = all.length ? Math.max(...all) : 1;
    const span = hi - lo || 1;
    return {
      raw: rawPts,
      ao5: avgPts,
      domain: { min: Math.max(0, lo - span * 0.06), max: hi + span * 0.06 },
      count: total - start,
      bestMs: best === Infinity ? null : best,
    };
  }, [solves, windowSize]);

  if (solves.length < 2) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-2">Solve a few more to see your trend</div>;
  }

  const plotW = WIDTH - PAD_L - PAD_R;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_L + (i / Math.max(1, count - 1)) * plotW;
  const y = (ms: number) => PAD_TOP + (1 - (ms - domain.min) / (domain.max - domain.min)) * plotH;
  const line = (pts: Point[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.ms).toFixed(1)}`).join(" ");
  // A DNF ao5 has no point, so the line breaks there rather than bridging the gap.
  const ao5Runs = ao5.reduce<Point[][]>((runs, p) => {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === p.i - 1) run.push(p);
    else runs.push([p]);
    return runs;
  }, []);
  const ao5Line = ao5Runs.map(line).join(" ");
  const area = ao5Runs
    .filter((run) => run.length > 1)
    .map((run) => `${line(run)} L${x(run[run.length - 1].i).toFixed(1)},${HEIGHT - PAD_BOTTOM} L${x(run[0].i).toFixed(1)},${HEIGHT - PAD_BOTTOM} Z`)
    .join(" ");
  const yTicks = ticks(domain.min, domain.max);
  const lastAo5 = ao5[ao5.length - 1];
  const showWindows = solves.length > 30;

  const rawAt = (i: number) => raw.find((p) => p.i === i);
  const ao5At = (i: number) => ao5.find((p) => p.i === i);
  const hoverRaw = hoverIndex !== null ? rawAt(hoverIndex) : undefined;
  const hoverAo5 = hoverIndex !== null ? ao5At(hoverIndex) : undefined;
  const hoverLeft = hoverIndex !== null ? Math.min(88, Math.max(12, (x(hoverIndex) / WIDTH) * 100)) : 0;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const vx = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((vx - PAD_L) / plotW) * Math.max(1, count - 1));
    setHoverIndex(Math.min(count - 1, Math.max(0, i)));
  };

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-2/70" /> solve
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded-full bg-accent" /> ao5
          </span>
          {raw.some((p) => p.pb) && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-warning ring-2 ring-bg-panel" /> new best
            </span>
          )}
        </div>
        {showWindows && (
          <div className="flex gap-0.5 rounded-full bg-bg-panel-2 p-0.5" role="group" aria-label="How many solves to chart">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setWindowSize(w);
                  setHoverIndex(null);
                }}
                aria-pressed={windowSize === w}
                className={cn(
                  "hit-y rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                  windowSize === w ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-foreground",
                )}
              >
                {w === 0 ? "All" : `Last ${w}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-pan-y"
          role="img"
          aria-label={`Solve times over ${count} solves${lastAo5 ? `, latest ao5 ${formatTime(lastAo5.ms)}` : ""}${bestMs !== null ? `, best ${formatTime(bestMs)}` : ""}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* recessive grid + the three seconds marks it spans */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray={t === yTicks[0] ? undefined : "2 4"} />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--muted-2)" className="tabular-timer">
                {(t / 1000).toFixed(1)}
              </text>
            </g>
          ))}

          {area && <path d={area} fill={`url(#${gradientId})`} />}

          {/* single solves: quiet dots, no connecting line */}
          {raw.map((p) => (
            <circle key={p.n} cx={x(p.i)} cy={y(p.ms)} r={count > 80 ? 1.4 : 2} fill="var(--muted-2)" fillOpacity={0.55} />
          ))}

          {/* the ao5 trend carries the story */}
          <path d={ao5Line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {raw
            .filter((p) => p.pb)
            .map((p) => (
              <circle key={`pb-${p.n}`} cx={x(p.i)} cy={y(p.ms)} r={4} fill="var(--warning)" stroke="var(--bg-panel)" strokeWidth={2} />
            ))}

          {lastAo5 && (
            <g>
              <circle cx={x(lastAo5.i)} cy={y(lastAo5.ms)} r={4.5} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
              {hoverIndex === null && (
                <text
                  x={Math.min(x(lastAo5.i), WIDTH - PAD_R - 2)}
                  y={y(lastAo5.ms) - 9}
                  textAnchor="end"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--foreground)"
                  className="tabular-timer"
                >
                  {formatTime(lastAo5.ms)}
                </text>
              )}
            </g>
          )}

          {/* crosshair */}
          {hoverIndex !== null && (
            <g pointerEvents="none">
              <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--border-strong)" strokeWidth={1} />
              {hoverRaw && <circle cx={x(hoverIndex)} cy={y(hoverRaw.ms)} r={4} fill="var(--foreground)" stroke="var(--bg-panel)" strokeWidth={2} />}
              {hoverAo5 && <circle cx={x(hoverIndex)} cy={y(hoverAo5.ms)} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />}
            </g>
          )}
        </svg>

        {hoverIndex !== null && (hoverRaw || hoverAo5) && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-bg-panel-2 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${hoverLeft}%` }}
          >
            <span className="text-muted-2">#{(hoverRaw ?? hoverAo5)!.n}</span>
            {hoverRaw && (
              <span className="tabular-timer ml-1.5 font-semibold text-foreground">
                {formatTime(hoverRaw.ms)}
                {hoverRaw.pb && <span className="ml-1 text-warning">best</span>}
              </span>
            )}
            {hoverAo5 && <span className="tabular-timer ml-1.5 text-accent">ao5 {formatTime(hoverAo5.ms)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
