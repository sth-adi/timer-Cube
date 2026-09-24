"use client";

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_PAIRS, buildMomentum } from "@/lib/analysis/momentum";

const pct = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;

/**
 * Momentum Meter: a hot-hand test for your solve times. Does the solve
 * right after a faster-than-usual one tend to be faster too, or is each
 * solve close to independent of the last?
 */
export default function MomentumPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => buildMomentum(allSolves), [allSolves]);

  return (
    <AnalyticsShell
      icon={<Flame size={17} className="text-accent" />}
      title="Momentum Meter"
      subtitle="Do fast solves cluster together, or is every solve independent of the last?"
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Momentum Meter needs at least {MIN_PAIRS} consecutive solve pairs within sittings of 5 or more — you don&apos;t have enough yet.</p>
          <p className="text-[11px] text-muted-2">A sitting is a run of solves with no 15+ minute gap. Keep going and this fills in.</p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.hasMomentum ? "Yes" : "No"}</p>
            <p className="text-xs font-medium text-muted">you {r.hasMomentum ? "carry momentum" : "don't carry momentum"}</p>
            <p className="max-w-sm text-[11px] text-muted-2">{r.pairs} consecutive solve pairs analyzed</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>The solve right after…</SectionTitle>
            {[
              { label: "…a faster-than-usual solve", rel: r.afterFastAvgRel },
              { label: "…a slower-than-usual solve", rel: r.afterSlowAvgRel },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="text-[11px] text-foreground">{row.label}</span>
                <span className="text-[11px] tabular-nums text-muted-2">{pct(row.rel)} vs sitting median</span>
              </div>
            ))}
            <p className="text-[10px] text-muted-2">Each solve is measured against its own sitting&apos;s median time, so a good day and a bad day compare fairly.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
