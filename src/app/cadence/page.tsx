"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_SOLVES, cadenceReport, type CadenceSolve } from "@/lib/analysis/cadence";

/** One dot per solve, oldest to newest, at its consistency score. */
function TrendStrip({ solves }: { solves: readonly CadenceSolve[] }) {
  const recent = solves.slice(-40);
  return (
    <div className="relative flex h-16 items-end gap-[2px]">
      {recent.map((s) => (
        <div
          key={s.id}
          className="min-w-[3px] flex-1 rounded-t-sm bg-accent/70"
          style={{ height: `${Math.max(4, s.consistency)}%` }}
          title={`${s.consistency}/100`}
        />
      ))}
    </div>
  );
}

/**
 * Cadence: how steadily you space your turns, independent of raw speed —
 * a smooth stream versus bursts-and-stutters at the same average TPS.
 */
export default function CadencePage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => cadenceReport(allSolves), [allSolves]);

  return (
    <AnalyticsShell
      icon={<Activity size={17} className="text-accent" />}
      title="Cadence"
      subtitle="How steady your turn-to-turn spacing is — smooth stream or stutters."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={allSolves.filter((s) => s.reconstruction && s.moveTimestamps).length} what="Cadence" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{Math.round(r.avgConsistency)}</p>
            <p className="text-xs font-medium text-muted">/100 rhythm consistency</p>
            <p className="max-w-sm text-[11px] text-muted-2">{r.solves.length} timed solves · last 12 average {Math.round(r.recentAvgConsistency)}</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Consistency over your last {Math.min(40, r.solves.length)} solves</SectionTitle>
            <TrendStrip solves={r.solves} />
            <p className="text-[10px] text-muted-2">Each bar is one solve&apos;s score (0-100). Taller is steadier turning.</p>
          </div>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Steadiest vs roughest</SectionTitle>
            {[
              { label: "Steadiest", s: r.best },
              { label: "Roughest", s: r.worst },
            ].map(({ label, s }) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="text-[11px] text-foreground">{label}</span>
                <span className="text-[11px] tabular-nums text-muted-2">
                  {s.consistency}/100 · {(s.meanGapMs / 1000).toFixed(2)}s/turn avg
                </span>
              </div>
            ))}
            <p className="text-[10px] text-muted-2">
              Consistency is 100 minus the coefficient of variation of your turning gaps — pauses to look aren&apos;t counted as stutters.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
