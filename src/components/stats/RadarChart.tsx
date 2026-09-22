"use client";

import type { DnaAxis } from "@/lib/stats/dna";

const SIZE = 240;
const CENTER = SIZE / 2;
const MAX_RADIUS = 84;
const RINGS = [1 / 3, 2 / 3, 1];

/** Angle 0 points straight up; each subsequent axis rotates clockwise by one N-th of a full turn — the standard radar/spider-chart layout. */
function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) };
}

function polygonPoints(radii: number[]): string {
  return radii.map((r, i) => polar(r, (i / radii.length) * Math.PI * 2)).map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * A generic N-axis spider/radar chart — every axis is assumed to already be
 * on a shared 0-100 scale (see computeDnaAxes), so this component only
 * handles the geometry and never touches what the numbers mean.
 */
export function RadarChart({ axes, className }: { axes: DnaAxis[]; className?: string }) {
  if (axes.length < 3) return null;
  const n = axes.length;
  const dataPoints = polygonPoints(axes.map((a) => (a.score / 100) * MAX_RADIUS));

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} role="img" aria-label="Solving-style radar chart">
      {RINGS.map((r) => (
        <polygon
          key={r}
          points={polygonPoints(Array(n).fill(r * MAX_RADIUS))}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const p = polar(MAX_RADIUS, (i / n) * Math.PI * 2);
        return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth={1} />;
      })}

      <polygon points={dataPoints} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const p = polar((a.score / 100) * MAX_RADIUS, (i / n) * Math.PI * 2);
        return <circle key={a.label} cx={p.x} cy={p.y} r={2.75} fill="var(--accent)" />;
      })}

      {axes.map((a, i) => {
        const angle = (i / n) * Math.PI * 2;
        const p = polar(MAX_RADIUS + 20, angle);
        // sin(angle) is this label's horizontal position relative to center —
        // used to keep text from overrunning the chart edge on the left/right.
        const sin = Math.sin(angle);
        const anchor = sin > 0.3 ? "start" : sin < -0.3 ? "end" : "middle";
        return (
          <text
            key={a.label}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted-2 text-[9px] font-medium uppercase tracking-wide"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
