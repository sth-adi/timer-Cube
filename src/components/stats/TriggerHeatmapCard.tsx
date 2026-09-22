"use client";

import { useMemo } from "react";
import { Flame, Zap } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeTriggerStats, FACE_TURNS, type TriggerStat } from "@/lib/analysis/triggers";
import { cn } from "@/lib/utils/cn";

/** Green (fast) through red (slow) — a heatmap reads by this convention regardless of the app's own accent theme, same reasoning as findings' fixed severity colors. */
function colorFor(pct: number): string {
  const hue = 140 - pct * 140;
  return `hsl(${hue} 62% 40%)`;
}

function TriggerRow({ stat }: { stat: TriggerStat }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="truncate font-mono text-foreground/90">{stat.pair}</span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-2">
        {stat.avgMs.toFixed(0)}ms <span className="text-muted-2/70">×{stat.count}</span>
      </span>
    </div>
  );
}

/**
 * Move-pair execution speed as an actual heatmap grid — every combination of
 * "first move → second move" gets its own cell, colored by how fast you
 * typically turn through it. A much more granular lens than the phase-level
 * stats elsewhere: two solves can spend the same total OLL time while one of
 * them is dragging on one specific finger trick the whole way through.
 *
 * Only solves captured live off a smart cube carry real per-move timing
 * (see Solve.moveTimestamps) — a keyboard-timed solve has nothing this can
 * draw from, so the card stays gently locked until there's enough of that
 * kind of data.
 */
export function TriggerHeatmapCard() {
  const solves = useSessionStore((s) => s.solves);
  const stats = useMemo(() => computeTriggerStats(solves), [solves]);

  const { pctByPair, sorted } = useMemo(() => {
    const ordered = [...stats].sort((a, b) => a.avgMs - b.avgMs);
    const map = new Map<string, number>();
    ordered.forEach((s, i) => map.set(s.pair, ordered.length > 1 ? i / (ordered.length - 1) : 0));
    return { pctByPair: map, sorted: ordered };
  }, [stats]);

  const byPair = useMemo(() => new Map(stats.map((s) => [s.pair, s])), [stats]);

  if (stats.length < 6) {
    return (
      <div className="card rounded-xl p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Flame size={14} className="text-accent" />
          Trigger heatmap
        </h3>
        <p className="text-xs text-muted-2">
          Solve a bit more on a smart cube — this reads real per-move timing, which only a live smart-cube capture
          carries.
        </p>
      </div>
    );
  }

  const slowest = sorted.slice(-5).reverse();
  const fastest = sorted.slice(0, 5);

  return (
    <div className="card animate-fade-in-up rounded-xl p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Flame size={14} className="text-accent" />
        Trigger heatmap
      </h3>
      <p className="mb-2.5 text-[11px] text-muted-2">
        Every move-pair you&apos;ve actually turned, colored by average speed — green is fast, red is where your
        fingers hesitate.
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="inline-grid gap-px" style={{ gridTemplateColumns: `28px repeat(${FACE_TURNS.length}, 14px)` }}>
          <div />
          {FACE_TURNS.map((col) => (
            <div key={col} className="flex h-5 items-end justify-center font-mono text-[8px] text-muted-2">
              {col}
            </div>
          ))}
          {FACE_TURNS.map((row) => (
            <div key={row} className="contents">
              <div className="flex h-3.5 items-center font-mono text-[8px] text-muted-2">{row}</div>
              {FACE_TURNS.map((col) => {
                const pair = `${row} ${col}`;
                const stat = byPair.get(pair);
                const pct = pctByPair.get(pair);
                return (
                  <div
                    key={col}
                    title={stat ? `${pair}: ${stat.avgMs.toFixed(0)}ms avg over ${stat.count} times` : `${pair}: not enough data`}
                    className={cn("h-3.5 w-3.5 rounded-[2px]", !stat && "bg-bg-panel-2/60")}
                    style={stat && pct !== undefined ? { backgroundColor: colorFor(pct) } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-2.5 sm:grid-cols-2">
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-danger">
            <Flame size={10} /> Weakest triggers
          </p>
          <div className="space-y-1">
            {slowest.map((s) => (
              <TriggerRow key={s.pair} stat={s} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-success">
            <Zap size={10} /> Fastest triggers
          </p>
          <div className="space-y-1">
            {fastest.map((s) => (
              <TriggerRow key={s.pair} stat={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
