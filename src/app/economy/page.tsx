"use client";

import { useMemo } from "react";
import { Minimize2 } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_SOLVES, buildEconomy } from "@/lib/analysis/economy";

/**
 * Move Economy Trend: the same learning-curve math Progress Forecast fits
 * to your solve times, fit instead to your move counts — a genuinely
 * different skill from turning faster.
 */
export default function EconomyPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => buildEconomy(allSolves), [allSolves]);
  const eligible = allSolves.filter((s) => s.reconstruction && s.penalty !== "dnf").length;

  return (
    <AnalyticsShell
      icon={<Minimize2 size={17} className="text-accent" />}
      title="Move Economy Trend"
      subtitle="A learning curve for your move count, not your time."
    >
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={eligible} what="Move Economy Trend" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.curve.current.toFixed(1)}</p>
            <p className="text-xs font-medium text-muted">turns/solve lately</p>
            <p className="max-w-sm text-[11px] text-muted-2">{r.solves} analyzed solves</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Move count over your history</SectionTitle>
            <div className="relative flex h-20 items-end gap-[2px]">
              {(() => {
                const shown = r.rolling.slice(-60);
                const max = Math.max(...shown);
                const min = Math.min(...shown);
                const span = Math.max(1, max - min);
                return shown.map((v, i) => <div key={i} className="min-w-[2px] flex-1 rounded-t-sm bg-accent/70" style={{ height: `${4 + ((v - min) / span) * 96}%` }} />);
              })()}
            </div>
            <p className="text-[10px] text-muted-2">A rolling average of your last 12 solves&apos; move count, over your most recent {Math.min(60, r.rolling.length)} solves.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
