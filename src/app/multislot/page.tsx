"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_EVENTS, analyzeMultiSlot, f2lInsertionEvents } from "@/lib/analysis/multislot";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Multi-Slot Report: the other half of the F2L Pause Map's data — every
 * time two or more pairs went in together, versus one at a time, and
 * whether the combined stretch actually cost less per pair or more.
 */
export default function MultiSlotPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeMultiSlot(allSolves), [allSolves]);
  const eventCount = useMemo(
    () =>
      allSolves
        .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0 && s.penalty !== "dnf")
        .reduce((n, s) => n + f2lInsertionEvents(s.scramble, s.reconstruction!.split(/\s+/).filter(Boolean), s.moveTimestamps!).length, 0),
    [allSolves],
  );

  return (
    <AnalyticsShell
      icon={<Layers size={17} className="text-accent" />}
      title="Multi-Slot Report"
      subtitle="Pairs solved together vs one at a time — and which is actually faster."
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">
            Multi-Slot Report needs at least {MIN_EVENTS} tracked F2L pair insertions — you have {eventCount}.
          </p>
          <p className="text-[11px] text-muted-2">
            An insertion is counted from a solve&apos;s saved reconstruction and move timing, so this can lag behind your total solve count — and if you
            always insert one pair at a time, it&apos;ll still report once you clear {MIN_EVENTS}, just with nothing to compare multi-slotting against.
          </p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{Math.round(r.multiPairShare * 100)}%</p>
            <p className="text-xs font-medium text-muted">of F2L pairs arrive multi-slotted</p>
            <p className="max-w-sm text-[11px] text-muted-2">
              {r.soloEvents} solo insertions · {r.multiEvents} multi-pair insertions
            </p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Cost per pair</SectionTitle>
            {[
              { label: "Solo", turns: r.avgTurnsPerPairSolo, ms: r.avgMsPerPairSolo, faster: r.faster === "solo", events: r.soloEvents },
              { label: "Multi-slotted", turns: r.avgTurnsPerPairMulti, ms: r.avgMsPerPairMulti, faster: r.faster === "multi", events: r.multiEvents },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-foreground">
                  {row.label}
                  {row.faster && <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">faster</span>}
                </span>
                <span className="text-[11px] tabular-nums text-muted-2">
                  {row.events === 0 ? "never" : `${row.turns.toFixed(1)} turns/pair · ${secs(row.ms)}/pair`}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-muted-2">
              Per-pair cost splits a multi-pair stretch evenly across the pairs it solved, so it&apos;s a fair comparison against solo insertions.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
