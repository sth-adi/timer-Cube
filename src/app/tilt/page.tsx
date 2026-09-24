"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_SAMPLE, analyzeTilt } from "@/lib/analysis/tilt";

const pct = (ratio: number) => `${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%`;

/**
 * Tilt Meter: does a flagged mistake (Mistake Radar) during Cross, F2L or
 * OLL bleed into the phase right after — running slower than your own
 * average for it — compared to when the phase before was clean?
 */
export default function TiltPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeTilt(allSolves), [allSolves]);
  const eligible = allSolves.filter((s) => s.reconstruction && s.moveTimestamps).length;

  return (
    <AnalyticsShell
      icon={<AlertTriangle size={17} className="text-accent" />}
      title="Tilt Meter"
      subtitle="Does a mistake early in a solve bleed into the phase right after?"
    >
      {!r ? (
        <NotEnough need={MIN_SAMPLE} have={eligible} what="Tilt Meter" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.tilts ? "Yes" : "No"}</p>
            <p className="text-xs font-medium text-muted">you {r.tilts ? "tilt" : "don't tilt"}</p>
            <p className="max-w-sm text-[11px] text-muted-2">
              {r.sampleSize} after-mistake samples · {r.controlSize} after-clean samples
            </p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Next phase, relative to your own average</SectionTitle>
            {[
              { label: "After a flagged mistake", ratio: r.afterMistakeAvgRatio, n: r.sampleSize },
              { label: "After a clean phase", ratio: r.afterCleanAvgRatio, n: r.controlSize },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="text-[11px] text-foreground">{row.label}</span>
                <span className="text-[11px] tabular-nums text-muted-2">
                  {pct(row.ratio)} · ×{row.n}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-muted-2">
              For each Cross/F2L/OLL mistake Mistake Radar flags, this compares the phase right after against your own average for that phase — pooled across every qualifying transition in your history.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
