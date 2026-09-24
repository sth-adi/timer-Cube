"use client";

import { useMemo } from "react";
import { Puzzle } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { F2lCaseIcon } from "@/components/algorithms/F2lCaseIcon";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_OCCURRENCES, MIN_SOLVES, analyzeF2lConsistency, type F2lCaseSpread } from "@/lib/analysis/f2lConsistency";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/** Your best turn count against your typical one, on one shared scale. */
function SpreadRow({ c, maxTurns }: { c: F2lCaseSpread; maxTurns: number }) {
  return (
    <div className="card flex items-center gap-3 rounded-xl p-3">
      {c.f2l ? <F2lCaseIcon facelets={c.f2l.facelets} pairFacelets={c.f2l.pairFacelets} className="h-11 w-11 shrink-0" /> : <div className="h-11 w-11 shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{c.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">{c.count}×</span>
        </p>
        <div className="relative h-2 rounded-full bg-bg-panel-2">
          <div
            className="absolute inset-y-0 rounded-full bg-warning/50"
            style={{ left: `${(c.bestTurns / maxTurns) * 100}%`, width: `${Math.max(1, (c.spread / maxTurns) * 100)}%` }}
          />
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-panel bg-accent" style={{ left: `${(c.bestTurns / maxTurns) * 100}%` }} />
        </div>
        <p className="text-[11px] tabular-nums text-muted-2">
          best <span className="text-foreground">{c.bestTurns}</span> turns · usually <span className="text-foreground">{c.medianTurns.toFixed(0)}</span>
          {c.lostMsPerSolve >= 10 && <> · {secs(c.lostMsPerSolve)}/solve</>}
        </p>
      </div>
    </div>
  );
}

/**
 * F2L Case Consistency: per F2L case, the fewest turns you've ever solved
 * it in against how many you usually take — the cases with a wide gap are
 * the ones you don't yet have a fixed algorithm for.
 */
export default function F2lCasesPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeF2lConsistency(allSolves), [allSolves]);
  const eligible = allSolves.filter((s) => s.reconstruction && s.moveTimestamps && s.penalty !== "dnf").length;
  const maxTurns = r ? Math.max(...r.cases.map((c) => c.medianTurns), 1) * 1.1 : 1;

  return (
    <AnalyticsShell icon={<Puzzle size={17} className="text-accent" />} title="F2L Case Consistency" subtitle="Your best turn count on each F2L case against your usual one.">
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={eligible} what="F2L Case Consistency" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.lostMsPerSolve >= 10 ? secs(r.lostMsPerSolve) : "0.00s"}</p>
            <p className="text-xs font-medium text-muted">a solve, from cases you haven&apos;t settled</p>
            <p className="max-w-sm text-[11px] text-muted-2">
              {r.pairs} pairs from {r.solves} solves · {r.medianTurnsPerPair.toFixed(0)} turns on a typical pair
            </p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          {r.worst.length > 0 && (
            <>
              <SectionTitle>Learn a fixed algorithm for these</SectionTitle>
              {r.worst.map((c) => (
                <SpreadRow key={c.key} c={c} maxTurns={maxTurns} />
              ))}
            </>
          )}

          <SectionTitle>Every case you&apos;ve had {MIN_OCCURRENCES}+ times</SectionTitle>
          {r.cases
            .filter((c) => !r.worst.includes(c))
            .map((c) => (
              <SpreadRow key={c.key} c={c} maxTurns={maxTurns} />
            ))}
          <p className="flex items-center justify-center gap-3 px-1 text-[10px] text-muted-2">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> your best
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-full bg-warning/50" /> turns over your best, usually
            </span>
          </p>
        </>
      )}
    </AnalyticsShell>
  );
}
