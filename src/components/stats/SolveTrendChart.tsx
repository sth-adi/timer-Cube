"use client";

import { useMemo, useState } from "react";
import type { Solve } from "@/types";
import { comparableTime, rollingAverages } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

const WIDTH = 560;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

interface Point {
  index: number;
  ms: number;
}

export function SolveTrendChart({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);

  const { rawPoints, ao5Points, domain } = useMemo(() => {
    const times = solves.map((s) => ({ ms: comparableTime(s) }));
    const raw: Point[] = [];
    times.forEach((t, i) => {
      if (Number.isFinite(t.ms)) raw.push({ index: i, ms: t.ms });
    });

    const rolling = rollingAverages(solves, 5);
    const ao5: Point[] = [];
    rolling.forEach((v, i) => {
      if (v !== null) ao5.push({ index: i, ms: v });
    });

    const allMs = [...raw.map((p) => p.ms), ...ao5.map((p) => p.ms)];
    const min = allMs.length ? Math.min(...allMs) : 0;
    const max = allMs.length ? Math.max(...allMs) : 1;
    const span = max - min || 1;
    return {
      rawPoints: raw,
      ao5Points: ao5,
      domain: { min: min - span * 0.08, max: max + span * 0.08 },
    };
  }, [solves]);

  const n = solves.length;
  if (n < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-2">
        Solve a few more to see your trend
      </div>
    );
  }

  const x = (index: number) => PAD_X + (index / Math.max(1, n - 1)) * (WIDTH - PAD_X * 2);
  const y = (ms: number) =>
    PAD_TOP + (1 - (ms - domain.min) / (domain.max - domain.min)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const rawPath = rawPoints.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.index)},${y(p.ms)}`).join(" ");
  const ao5Path = ao5Points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.index)},${y(p.ms)}`).join(" ");

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        onMouseLeave={() => setHover(null)}
      >
        {/* recessive baseline */}
        <line
          x1={PAD_X}
          x2={WIDTH - PAD_X}
          y1={HEIGHT - PAD_BOTTOM}
          y2={HEIGHT - PAD_BOTTOM}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* raw solves: muted, thin */}
        <path d={rawPath} fill="none" stroke="var(--muted-2)" strokeWidth={1.5} strokeOpacity={0.5} strokeLinejoin="round" />
        {rawPoints.map((p) => (
          <circle key={p.index} cx={x(p.index)} cy={y(p.ms)} r={2} fill="var(--muted-2)" fillOpacity={0.6} />
        ))}

        {/* ao5 trend: accent, bolder, on top */}
        <path d={ao5Path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {ao5Points.length > 0 && (
          <circle
            cx={x(ao5Points[ao5Points.length - 1].index)}
            cy={y(ao5Points[ao5Points.length - 1].ms)}
            r={4}
            fill="var(--accent)"
            stroke="var(--bg-panel)"
            strokeWidth={2}
          />
        )}

        {/* hover targets */}
        {rawPoints.map((p) => (
          <circle
            key={`hit-${p.index}`}
            cx={x(p.index)}
            cy={y(p.ms)}
            r={8}
            fill="transparent"
            onMouseEnter={() =>
              setHover({ x: x(p.index), y: y(p.ms), label: `#${p.index + 1} · ${formatTime(p.ms)}` })
            }
          />
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute rounded-md bg-bg-panel-2 border border-border-strong px-2 py-1 text-[11px] tabular-timer text-foreground shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: `${(hover.x / WIDTH) * 100}%`, top: `${(hover.y / HEIGHT) * 100}%` }}
        >
          {hover.label}
        </div>
      )}

      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-muted-2 opacity-60" /> solve
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-accent" /> ao5
        </span>
      </div>
    </div>
  );
}
