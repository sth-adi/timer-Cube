"use client";

import { useMemo } from "react";
import { RotateCw } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_TURNS_PER_FACE, computeSpinReport } from "@/lib/analysis/spin";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Spin: clockwise vs counter-clockwise turn bias, and which side of each
 * opposite-face axis (U/D, R/L, F/B) costs more time per turn.
 */
export default function SpinPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => computeSpinReport(allSolves), [allSolves]);

  return (
    <AnalyticsShell
      icon={<RotateCw size={17} className="text-accent" />}
      title="Spin"
      subtitle="Clockwise vs counter-clockwise, and which side of each axis is slower."
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">
            Spin needs at least {MIN_TURNS_PER_FACE} qualifying turns on two opposite faces, or a clear mix of clockwise and counter-clockwise turns.
          </p>
          <p className="text-[11px] text-muted-2">Every smart-cube solve with timing adds to this — keep going and it fills in.</p>
        </div>
      ) : (
        <>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          {r.directions.length === 2 && (
            <div className="card flex flex-col gap-3 rounded-xl p-4">
              <SectionTitle>Direction bias</SectionTitle>
              {(() => {
                const max = Math.max(...r.directions.map((d) => d.avgGapMs));
                return r.directions.map((d) => (
                  <div key={d.direction} className="flex items-center gap-2 text-xs">
                    <span className="w-10 shrink-0 font-mono font-semibold text-foreground/90">{d.direction === "cw" ? "CW" : "CCW"}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                      <div className="absolute inset-y-0 left-0 rounded bg-accent/60" style={{ width: `${max > 0 ? (d.avgGapMs / max) * 100 : 0}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right tabular-nums text-muted-2">
                      {Math.round(d.avgGapMs)}ms · ×{d.turnCount}
                    </span>
                  </div>
                ));
              })()}
              <p className="text-[10px] text-muted-2">Average time per quarter turn in each direction, across every face — half turns have no direction.</p>
            </div>
          )}

          {r.axes.length > 0 && (
            <div className="card flex flex-col gap-3 rounded-xl p-4">
              <SectionTitle>Opposite-face axes</SectionTitle>
              {r.axes.map((a) => (
                <div key={a.axis} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                  <span className="text-[11px] text-foreground">
                    {a.faces[0]} / {a.faces[1]}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-2">
                    {a.slowerFace} slower by {secs(a.diffMs)}/turn
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-muted-2">Only axes where both faces have at least {MIN_TURNS_PER_FACE} qualifying turns are shown.</p>
            </div>
          )}
        </>
      )}
    </AnalyticsShell>
  );
}
