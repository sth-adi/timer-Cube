"use client";

import { useMemo, useState } from "react";
import { Move3d } from "lucide-react";
import type { Solve } from "@/types";
import { computeEfficiencyPoints, type EfficiencyPoint } from "@/lib/analysis/smartCubeInsights";
import { formatTime } from "@/lib/utils/time";

const WIDTH = 280;
const HEIGHT = 180;
const PAD = 10;
/** Most recent points shown — plenty for the pattern, cheap to render. */
const MAX_POINTS = 300;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Move count vs. solve time for every reconstructed solve: two solves with
 * the same time can land in very different places here — one got there with
 * fewer moves, the other by turning faster — a distinction no single-number
 * stat shows. Quadrant lines split at the median of each axis.
 */
export function EfficiencyQuadrantCard({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<EfficiencyPoint | null>(null);
  const points = useMemo(() => computeEfficiencyPoints(solves).slice(-MAX_POINTS), [solves]);

  if (points.length < 6) return null;

  const moveCounts = points.map((p) => p.moveCount);
  const times = points.map((p) => p.timeMs);
  const minMoves = Math.min(...moveCounts);
  const maxMoves = Math.max(...moveCounts);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const medMoves = median(moveCounts);
  const medTime = median(times);

  const x = (moves: number) =>
    maxMoves > minMoves ? PAD + ((moves - minMoves) / (maxMoves - minMoves)) * (WIDTH - 2 * PAD) : WIDTH / 2;
  // Inverted: faster (lower time) plots lower on screen, matching "down-left is best".
  const y = (ms: number) =>
    maxTime > minTime ? HEIGHT - PAD - ((ms - minTime) / (maxTime - minTime)) * (HEIGHT - 2 * PAD) : HEIGHT / 2;

  return (
    <div className="card rounded-xl p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Move3d size={14} className="text-accent" />
        Efficiency vs. speed
      </h3>
      <div className="relative">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: HEIGHT }}>
          <line x1={x(medMoves)} y1={0} x2={x(medMoves)} y2={HEIGHT} stroke="var(--border)" strokeDasharray="3 3" />
          <line x1={0} y1={y(medTime)} x2={WIDTH} y2={y(medTime)} stroke="var(--border)" strokeDasharray="3 3" />
          {points.map((p) => (
            <circle
              key={p.id}
              cx={x(p.moveCount)}
              cy={y(p.timeMs)}
              r={hover?.id === p.id ? 4 : 2.5}
              fill={hover?.id === p.id ? "var(--accent)" : "var(--accent-soft)"}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover((h) => (h?.id === p.id ? null : h))}
            />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-border-strong bg-bg-panel-2 px-2 py-1 text-[11px] tabular-timer shadow-lg">
            {formatTime(hover.timeMs)} · {hover.moveCount} moves · {hover.tps.toFixed(1)} tps
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-2">
        <span>fewer moves →</span>
        <span>↓ faster</span>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
        Each dot is one solve: moves across, time down. Bottom-left is your best solves; top-left means efficient
        solutions held back by turn speed; bottom-right means fast fingers wasted on longer solutions.
      </p>
    </div>
  );
}
