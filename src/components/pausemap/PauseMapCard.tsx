"use client";

import { useMemo } from "react";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { drillEffect, type HandoffStat, type PauseMapReport } from "@/lib/pausemap/pauseMap";
import { firstDrilled, usePauseDrillStore } from "@/lib/store/pauseDrillStore";
import { cn } from "@/lib/utils/cn";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const VERDICT: Record<NonNullable<HandoffStat["verdict"]>, { label: string; className: string }> = {
  finding: { label: "stops to look", className: "bg-danger/15 text-danger" },
  solution: { label: "long way round", className: "bg-warning/15 text-warning" },
  fine: { label: "flowing", className: "bg-success/15 text-success" },
};

function HandoffRow({ h, max }: { h: HandoffStat; max: number }) {
  const w = (ms: number) => `${max > 0 ? (ms / max) * 100 : 0}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{h.label}</span>
        {h.verdict ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", VERDICT[h.verdict].className)}>{VERDICT[h.verdict].label}</span>
        ) : (
          <span className="text-[10px] text-muted-2">{h.count} pairs · need more</span>
        )}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-bg-panel-2" title={`finding ${secs(h.findMs)} · stalls ${secs(h.stallMs)} · turning ${secs(h.turningMs)}`}>
        <div className="h-full bg-danger/70" style={{ width: w(h.findMs) }} />
        <div className="h-full bg-warning/70" style={{ width: w(h.stallMs) }} />
        <div className="h-full bg-accent/60" style={{ width: w(h.turningMs) }} />
      </div>
      {h.count > 0 && (
        <p className="text-[10px] tabular-nums text-muted-2">
          {secs(h.totalMs)} a pair · stop to look in {Math.round(h.stallRate * 100)}% · {h.turns.toFixed(1)} turns (+{h.extraTurns.toFixed(1)} over fewest) ·{" "}
          {h.count} pairs
        </p>
      )}
    </div>
  );
}

/** The pause map itself, plus whether drilling a hand-off changed your real solves. */
export function PauseMapCard({ report, onDrill }: { report: PauseMapReport; onDrill: (() => void) | null }) {
  const drills = usePauseDrillStore((s) => s.history);
  const max = Math.max(1, ...report.handoffs.map((h) => h.totalMs));

  const effects = useMemo(
    () =>
      report.handoffs
        .map((h) => {
          const since = firstDrilled(drills, h.order);
          return since === null ? null : { h, e: drillEffect(report.stretches, h.order, since), n: drills.filter((d) => d.order === h.order).length };
        })
        .filter((x) => x !== null),
    [drills, report],
  );

  return (
    <div className="card flex flex-col gap-3 rounded-xl p-4">
      <p className="text-[11px] leading-relaxed text-muted">{report.headline}</p>
      <div className="flex flex-col gap-3">
        {report.handoffs.map((h) => (
          <HandoffRow key={h.order} h={h} max={max} />
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-2">
        <span className="text-danger">Finding</span>: the pause from the previous pair going in to your first turn on the next.{" "}
        <span className="text-warning">Stalls</span>: pauses of {PAUSE_MS}ms+ after you&apos;d started it. <span className="text-accent">Turning</span>: the rest.
        From {report.pairs} pairs in {report.solves} smart-cube solves; pairs that went in together are left out.
      </p>

      {onDrill && report.worst && (
        <button type="button" onClick={onDrill} className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
          Drill {report.worst.label.toLowerCase()} · {report.examples.length} real position{report.examples.length === 1 ? "" : "s"}
        </button>
      )}

      {effects.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg bg-bg-panel-2 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Did drilling help? (your real solves, not the drills)</p>
          {effects.map(({ h, e, n }) => (
            <div key={h.order} className="text-[11px] text-muted">
              <span className="font-medium text-foreground">{h.label}</span> — drilled {n}× since {new Date(e.since).toLocaleDateString()}.{" "}
              {e.enough ? (
                <>
                  Finding pause {secs(e.before.findMs)} → {secs(e.after.findMs)}, stopping in {Math.round(e.before.stallRate * 100)}% →{" "}
                  {Math.round(e.after.stallRate * 100)}% of solves ({e.before.pairs} pairs before, {e.after.pairs} after).
                </>
              ) : (
                <>
                  Too early to tell: {e.before.pairs} pairs before, {e.after.pairs} since — needs 10 on each side.
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
