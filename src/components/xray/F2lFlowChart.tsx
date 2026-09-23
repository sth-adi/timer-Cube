"use client";

import { Check, TriangleAlert, Waves } from "lucide-react";
import type { F2lFlowReport } from "@/lib/xray/f2lFlow";
import { PAIR_COLORS, PAIR_LABELS } from "@/lib/xray/common";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const W = 320;
const H = 150;
const PAD = { l: 22, r: 8, t: 10, b: 20 };

function PairChip({ pair }: { pair: number }) {
  const [a, b] = PAIR_COLORS[pair];
  return (
    <span className="inline-flex h-3 w-3 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/30">
      <span className="h-full w-1/2" style={{ background: a }} />
      <span className="h-full w-1/2" style={{ background: b }} />
    </span>
  );
}

/**
 * The F2L Flow chart: every pair's true distance-to-solved after every turn
 * of F2L, as four two-tone lines (each in its pair's two colors) falling to
 * zero. Below it, one line per pair decision: whether it was the easiest
 * pair available, and what solving it did to the pairs still waiting.
 */
export function F2lFlowChart({ report }: { report: F2lFlowReport }) {
  const { points, decisions } = report;
  const t0 = points[0]?.atMs ?? 0;
  const t1 = Math.max(t0 + 1, points[points.length - 1]?.atMs ?? 1);
  const maxD = Math.max(4, ...points.flatMap((p) => p.distances));
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (d: number) => PAD.t + (1 - d / maxD) * (H - PAD.t - PAD.b);

  const pathFor = (pair: number) =>
    points
      .map((p, i) => {
        const px = x(p.atMs);
        const py = y(p.distances[pair]);
        if (i === 0) return `M${px},${py}`;
        // Step shape: a distance only changes on a turn, so hold the previous value until then.
        return `H${px} V${py}`;
      })
      .join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Waves size={13} className="text-accent" /> F2L Flow
        </p>
        <p className="text-[11px] text-muted">
          flow score <span className="font-bold tabular-nums text-foreground">{report.flowScore}</span>
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Distance to solved for each F2L pair over time">
        {decisions.map((d, i) => (
          <rect
            key={d.pair}
            x={x(d.startMs)}
            y={PAD.t}
            width={Math.max(0, x(d.endMs) - x(d.startMs))}
            height={H - PAD.t - PAD.b}
            fill="var(--foreground)"
            opacity={i % 2 === 0 ? 0.035 : 0.07}
          />
        ))}
        {Array.from({ length: maxD + 1 }, (_, d) => d)
          .filter((d) => d % 2 === 0)
          .map((d) => (
            <g key={d}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(d)} y2={y(d)} stroke="var(--border)" strokeWidth={0.5} />
              <text x={PAD.l - 5} y={y(d) + 3} fontSize={8} textAnchor="end" fill="var(--muted-2)">
                {d}
              </text>
            </g>
          ))}
        {[0, 1, 2, 3].map((pair) => {
          const [a, b] = PAIR_COLORS[pair];
          const d = pathFor(pair);
          return (
            <g key={pair}>
              <path d={d} fill="none" stroke={a} strokeWidth={2.6} strokeLinejoin="round" />
              <path d={d} fill="none" stroke={b} strokeWidth={2.6} strokeDasharray="5 5" strokeLinejoin="round" />
            </g>
          );
        })}
        {decisions.map((d) => (
          <circle key={d.pair} cx={x(d.endMs)} cy={y(0)} r={3.5} fill="var(--success)" stroke="var(--background)" strokeWidth={1} />
        ))}
        <text x={PAD.l} y={H - 5} fontSize={8} fill="var(--muted-2)">
          cross done
        </text>
        <text x={W - PAD.r} y={H - 5} fontSize={8} textAnchor="end" fill="var(--muted-2)">
          F2L done · {formatTime(t1 - t0)}
        </text>
      </svg>

      {report.freePairs.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-success">
          <Check size={12} /> Free pair{report.freePairs.length > 1 ? "s" : ""} after the cross:{" "}
          {report.freePairs.map((p) => PAIR_LABELS[p]).join(", ")}
        </p>
      )}

      <ol className="flex flex-col gap-1.5">
        {decisions.map((d, i) => (
          <li key={d.pair} className="flex flex-col gap-1 rounded-lg bg-bg-panel-2 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <span className="text-muted-2">{i + 1}.</span>
                <PairChip pair={d.pair} />
                {d.label}
              </span>
              <span className="text-[10px] tabular-nums text-muted-2">
                {d.movesUsed} turns · {formatTime(d.endMs - d.startMs)}
              </span>
            </div>
            {d.regret === 0 ? (
              <p className="flex items-center gap-1 text-[10px] text-success">
                <Check size={11} /> Easiest pair available ({d.chosenDistance} away)
              </p>
            ) : (
              <p className="flex items-center gap-1 text-[10px] text-warning">
                <TriangleAlert size={11} /> Picked a {d.chosenDistance}-turn pair while
                <PairChip pair={d.easiestPair} />
                {PAIR_LABELS[d.easiestPair]} was {d.easiestDistance} away
              </p>
            )}
            {d.sideEffects.some((e) => e.before !== e.after) && (
              <div className="flex flex-wrap gap-1">
                {d.sideEffects
                  .filter((e) => e.before !== e.after)
                  .map((e) => (
                    <span
                      key={e.pair}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        e.after < e.before ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                      )}
                    >
                      <PairChip pair={e.pair} />
                      {e.after < e.before ? "set up" : "scattered"} {e.before}→{e.after}
                    </span>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export { PairChip };
