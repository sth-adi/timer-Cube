"use client";

import { useMemo } from "react";
import { Snowflake } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { COLD_WINDOW, MIN_SAMPLES, analyzeColdStart } from "@/lib/analysis/coldStart";

/**
 * Cold Start Tax: right after a pause to look, are your first few turns
 * slower than your steady turning speed — a motor cold start, separate
 * from whatever you paused to look at.
 */
export default function ColdStartPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeColdStart(allSolves), [allSolves]);

  return (
    <AnalyticsShell
      icon={<Snowflake size={17} className="text-accent" />}
      title="Cold Start Tax"
      subtitle="Are your first few turns after a pause slower than your steady speed?"
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Cold Start Tax needs at least {MIN_SAMPLES} turns right after a pause, and {MIN_SAMPLES} steady turns to compare against.</p>
          <p className="text-[11px] text-muted-2">Every smart-cube solve with move timing adds to this — keep going and it fills in.</p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.hasColdStart ? `+${Math.round(r.taxShare * 100)}%` : "No tax"}</p>
            <p className="text-xs font-medium text-muted">{r.hasColdStart ? "slower right out of a pause" : "turns are just as fast right after a pause"}</p>
            <p className="max-w-sm text-[11px] text-muted-2">
              {r.coldSamples} post-pause turns · {r.warmSamples} steady turns
            </p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Speed per turn</SectionTitle>
            {(() => {
              const max = Math.max(r.coldAvgMs, r.warmAvgMs);
              return [
                { label: `First ${COLD_WINDOW} turns after a look`, ms: r.coldAvgMs },
                { label: "Steady turning", ms: r.warmAvgMs },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 text-foreground/90">{row.label}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                    <div className="absolute inset-y-0 left-0 rounded bg-accent/60" style={{ width: `${max > 0 ? (row.ms / max) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-2">{Math.round(row.ms)}ms</span>
                </div>
              ));
            })()}
            <p className="text-[10px] text-muted-2">Every pause counts, mistake or not — only whether the turns right after it are slower than the rest of the same solve.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
