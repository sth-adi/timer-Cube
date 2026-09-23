"use client";

import { HeartPulse } from "lucide-react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import type { CubeHealthReport, FaceHealth, HealthStatus } from "@/lib/analysis/cubeHealth";
import { cn } from "@/lib/utils/cn";

const STATUS_STYLE: Record<HealthStatus, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-success/15 text-success" },
  watch: { label: "Watch", className: "bg-warning/15 text-warning" },
  attention: { label: "Needs attention", className: "bg-danger/15 text-danger" },
  unknown: { label: "Too few turns", className: "bg-bg-panel-2 text-muted-2" },
};

/** Plus-shaped cube net — each physical face as a tile in its own color, with its health score on it. */
const NET: { face: FaceHealth["face"]; col: number; row: number }[] = [
  { face: "U", col: 2, row: 1 },
  { face: "L", col: 1, row: 2 },
  { face: "F", col: 2, row: 2 },
  { face: "R", col: 3, row: 2 },
  { face: "B", col: 4, row: 2 },
  { face: "D", col: 2, row: 3 },
];

function FaceTile({ f }: { f: FaceHealth }) {
  const ring =
    f.status === "healthy" ? "var(--success)" : f.status === "watch" ? "var(--warning)" : f.status === "attention" ? "var(--danger)" : "var(--border)";
  const dark = f.face === "U" || f.face === "D";
  return (
    <div
      className="flex aspect-square flex-col items-center justify-center rounded-lg"
      style={{ background: FACELET_COLORS[f.face], boxShadow: `0 0 0 3px ${ring}` }}
      title={`${f.color}: ${STATUS_STYLE[f.status].label}`}
    >
      <span className={cn("text-lg font-bold tabular-nums", dark ? "text-black/80" : "text-white")}>
        {f.status === "unknown" ? "–" : f.score}
      </span>
    </div>
  );
}

/**
 * The Cube Health report: which physical face of *this cube* is overshooting,
 * dragging, or wearing out — derived purely from when each face turned
 * across your smart-cube history (see lib/analysis/cubeHealth.ts).
 */
export function CubeHealthPanel({ report }: { report: CubeHealthReport | null }) {
  if (!report) {
    return (
      <p className="py-4 text-center text-xs text-muted">
        Do at least 3 solves on a connected smart cube and each face&apos;s health shows up here.
      </p>
    );
  }
  const byFace = new Map(report.faces.map((f) => [f.face, f]));
  const ranked = [...report.faces].sort((a, b) => (a.status === "unknown" ? 1 : 0) - (b.status === "unknown" ? 1 : 0) || a.score - b.score);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="grid w-40 shrink-0 grid-cols-4 grid-rows-3 gap-1.5">
          {NET.map(({ face, col, row }) => (
            <div key={face} style={{ gridColumn: col, gridRow: row }}>
              <FaceTile f={byFace.get(face)!} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-3xl font-bold tabular-nums text-foreground">
            <HeartPulse size={20} className="text-accent" />
            {report.overallScore}
          </p>
          <p className="text-xs font-medium text-foreground">{report.headline}</p>
          <p className="text-[10px] text-muted-2">
            {report.turnsAnalyzed.toLocaleString()} turns · {report.solvesAnalyzed} solves
            {report.peakTps !== null && ` · peak ${report.peakTps.toFixed(1)} TPS`}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {ranked.map((f) => (
          <li key={f.face} className="flex flex-col gap-1 rounded-lg bg-bg-panel-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className="h-3 w-3 rounded-[3px] ring-1 ring-black/30" style={{ background: FACELET_COLORS[f.face] }} />
                {f.color}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[f.status].className)}>
                {STATUS_STYLE[f.status].label}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted-2">
              <span>{f.turns} turns</span>
              <span>{f.catchesPer100.toFixed(1)} catches/100</span>
              {f.relativeDrag !== null && (
                <span>{f.relativeDrag >= 1 ? "+" : ""}{Math.round((f.relativeDrag - 1) * 100)}% drag</span>
              )}
              {f.wearTrend !== null && (
                <span>
                  {f.wearTrend >= 0 ? "+" : ""}
                  {Math.round(f.wearTrend * 100)}% wear
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted">{f.advice}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
