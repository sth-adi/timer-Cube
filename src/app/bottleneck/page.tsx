"use client";

import { useMemo } from "react";
import { Crosshair } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_CASES, analyzeBottlenecks } from "@/lib/analysis/bottleneck";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Bottleneck Report: for every case you've had often enough to mean
 * something, is the time recognition or execution — so you know whether to
 * drill flashcards or drill fingers.
 */
export default function BottleneckPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeBottlenecks(allSolves), [allSolves]);

  return (
    <AnalyticsShell
      icon={<Crosshair size={17} className="text-accent" />}
      title="Bottleneck Report"
      subtitle="Is each slow case costing you recognition time, or execution time?"
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Bottleneck Report needs at least {MIN_CASES} OLL/PLL/F2L cases you&apos;ve each hit a few times.</p>
          <p className="text-[11px] text-muted-2">Every smart-cube solve logs its cases automatically — see Case History to check.</p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">
              {r.recognitionBound.length}/{r.executionBound.length}
            </p>
            <p className="text-xs font-medium text-muted">recognition-bound / execution-bound cases</p>
            <p className="max-w-sm text-[11px] text-muted-2">out of {r.cases.length} tracked cases</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Costliest cases overall</SectionTitle>
            {r.cases.slice(0, 8).map((c) => (
              <div key={`${c.group}-${c.key}`} className="flex items-center justify-between gap-2 rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-foreground">
                  <span className="shrink-0 rounded-full bg-bg-panel px-1.5 py-0.5 text-[9px] font-semibold text-muted">{c.group}</span>
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-2">
                  {secs(c.costMs)} total ·{" "}
                  <span className={c.kind === "recognition" ? "text-warning" : c.kind === "execution" ? "text-accent" : ""}>
                    {c.kind === "recognition" ? "recognition" : c.kind === "execution" ? "execution" : "balanced"}
                  </span>
                </span>
              </div>
            ))}
            <p className="text-[10px] text-muted-2">Total cost is average time × how often it came up. A case needs 3+ occurrences to be classified.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
