"use client";

import { useCallback, useMemo, useState } from "react";
import type { Solve } from "@/types";
import { comparableTime, computeHistogram } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { clampReadout, slotIndex } from "./chartMath";
import { useDismissOutside, useElementWidth } from "./chartKit";
import "@/styles/stats-charts.css";

const PLOT_H = 112;
const HEADER_H = 24;
const READOUT_W = 176;

export function SolveHistogram({ solves }: { solves: Solve[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [setWrap, width, wrapEl] = useElementWidth(336);
  const buckets = useMemo(() => computeHistogram(solves, 12), [solves]);
  const median = useMemo(() => {
    const t = solves.map(comparableTime).filter(Number.isFinite).sort((a, b) => a - b);
    if (t.length === 0) return null;
    const mid = Math.floor(t.length / 2);
    return t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2;
  }, [solves]);
  const dismiss = useCallback(() => setActive(null), []);
  useDismissOutside(wrapEl, active !== null, dismiss);

  if (buckets.length < 3) {
    return <p className="text-muted-2 text-sm text-center py-6">Solve a few more for a distribution chart.</p>;
  }

  const n = buckets.length;
  const max = Math.max(...buckets.map((b) => b.count));
  const lo = buckets[0].from;
  const hi = buckets[n - 1].to;
  const medianPct = median !== null ? Math.min(100, Math.max(0, ((median - lo) / (hi - lo || 1)) * 100)) : null;
  const mode = buckets.findIndex((b) => b.count === max);
  const w = Math.max(240, width);
  const plural = (c: number) => `${c} solve${c === 1 ? "" : "s"}`;

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(slotIndex(e.clientX - rect.left, rect.width, n));
  };
  const activeBucket = active !== null ? buckets[active] : null;
  const tickAt = [0, Math.round(n / 3), Math.round((2 * n) / 3), n];

  return (
    <div ref={setWrap}>
      <div className="relative" style={{ height: HEADER_H + PLOT_H }}>
        {/* the header strip is the readout: the median's name when idle, the touched bucket otherwise, never under the finger */}
        {activeBucket && active !== null ? (
          <div
            className="pointer-events-none absolute top-0 flex items-baseline gap-1.5 whitespace-nowrap rounded-lg border border-border-strong bg-bg-panel-2 px-2 py-0.5 text-[11px] shadow-lg"
            style={{ left: clampReadout(((active + 0.5) / n) * w, READOUT_W, w), width: READOUT_W }}
          >
            <span className="tabular-timer text-[13px] font-semibold text-foreground">{plural(activeBucket.count)}</span>
            <span className="tabular-timer text-muted-2">
              {formatTime(activeBucket.from)}–{formatTime(activeBucket.to)}
            </span>
          </div>
        ) : (
          medianPct !== null && (
            <span
              className="tabular-timer pointer-events-none absolute top-0 whitespace-nowrap text-[11px] font-medium text-muted"
              style={medianPct > 55 ? { right: `calc(${100 - medianPct}% + 6px)` } : { left: `calc(${medianPct}% + 6px)` }}
            >
              median {formatTime(median!)}
            </span>
          )
        )}

        <div
          className="absolute inset-x-0 bottom-0 flex touch-pan-y select-none border-b border-border-strong"
          style={{ height: PLOT_H }}
          onPointerDown={pick}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.buttons > 0 || e.pointerType === "touch") pick(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
        >
          {buckets.map((b, i) => (
            <div
              key={i}
              role="img"
              aria-label={`${formatTime(b.from)} to ${formatTime(b.to)}: ${plural(b.count)}`}
              className="relative h-full flex-1"
            >
              {/* 2px of air either side of every bar; a 4px round on the data end, square at the baseline */}
              <div
                className={`sc-bar sc-rise absolute inset-x-px bottom-0 rounded-t-[4px] ${active !== null && active !== i ? "sc-dim" : ""}`}
                style={{
                  height: b.count === 0 ? 2 : `${Math.max(4, (b.count / max) * 82)}%`,
                  background: b.count === 0 ? "var(--border-strong)" : "var(--accent)",
                  ["--sc-delay" as string]: `${i * 25}ms`,
                }}
              />
              {i === mode && active === null && (
                <span
                  className="tabular-timer pointer-events-none absolute inset-x-0 z-10 text-center text-[11px] font-semibold text-foreground"
                  style={{ textShadow: "0 0 3px var(--bg-panel), 0 0 3px var(--bg-panel), 0 0 5px var(--bg-panel)", bottom: `calc(${Math.max(4, (b.count / max) * 82)}% + 3px)` }}
                >
                  {b.count}
                </span>
              )}
            </div>
          ))}
          {medianPct !== null && (
            <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/55" style={{ left: `${medianPct}%` }} />
          )}
        </div>
      </div>

      <div className="relative mt-1.5 h-4 text-[11px] text-muted-2 tabular-timer" aria-hidden>
        {tickAt.map((k, idx) => {
          const t = k >= n ? hi : buckets[k].from;
          const pos = (k / n) * 100;
          return (
            <span
              key={k}
              className="absolute top-0 whitespace-nowrap"
              style={{ left: `${pos}%`, transform: idx === 0 ? undefined : idx === tickAt.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
            >
              {formatTime(t)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
