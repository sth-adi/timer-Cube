/**
 * Aggregates a batch of solve analyses into a ranked "what's actually costing
 * you the most time" report. A single analyzed solve tells you about that
 * one attempt; this looks across every solve you've bothered to analyze and
 * asks the more useful question — not "was this solve's OLL slow" but
 * "which OLL case keeps being slow."
 */

import type { SolveAnalysis } from "./analyze";
import type { PhaseId } from "./segment";

export interface WeaknessEntry {
  /** "Cross" / "F2L" / "OLL" / "PLL", or a case name like "T Perm" for the case-level report. */
  label: string;
  /** Sum of extra moves (STM) versus the shortest available, across every occurrence. */
  totalLost: number;
  /** How many analyzed solves this label actually showed up in. */
  occurrences: number;
  /** totalLost / occurrences — the average cost each time it happens. */
  avgLost: number;
}

export interface WeaknessReport {
  analyzedCount: number;
  phases: WeaknessEntry[];
  cases: WeaknessEntry[];
}

const PHASE_DISPLAY_LABEL: Record<PhaseId, string> = {
  cross: "Cross",
  f2l: "F2L",
  oll: "OLL",
  pll: "PLL",
};

function toEntries(totals: Map<string, { lost: number; count: number }>): WeaknessEntry[] {
  return [...totals.entries()]
    .map(([label, { lost, count }]) => ({ label, totalLost: lost, occurrences: count, avgLost: lost / count }))
    .filter((e) => e.totalLost > 0)
    .sort((a, b) => b.totalLost - a.totalLost);
}

/**
 * Builds the report from a set of successful analyses. Solves that failed to
 * analyze (a stale reconstruction that no longer matches its scramble, say)
 * are the caller's problem to filter out before this — this function only
 * ever sees analyses that actually completed.
 */
export function aggregateWeakness(analyses: readonly SolveAnalysis[]): WeaknessReport {
  const phaseTotals = new Map<string, { lost: number; count: number }>();
  const caseTotals = new Map<string, { lost: number; count: number }>();

  for (const analysis of analyses) {
    if (!analysis.cfopShaped) continue;

    // Phases are bucketed by kind (Cross/F2L/OLL/PLL), not by slot number —
    // "F2L 1" vs "F2L 3" is just solve order, not a case identity, so all
    // four F2L segments of a solve fold into one "F2L" bucket.
    const byPhaseKind = new Map<PhaseId, number>();
    for (const phase of analysis.phases) {
      if (phase.lost === null || phase.lost <= 0) continue;
      byPhaseKind.set(phase.phase, (byPhaseKind.get(phase.phase) ?? 0) + phase.lost);

      if ((phase.phase === "oll" || phase.phase === "pll") && phase.caseName && !phase.skipped) {
        const current = caseTotals.get(phase.caseName) ?? { lost: 0, count: 0 };
        caseTotals.set(phase.caseName, { lost: current.lost + phase.lost, count: current.count + 1 });
      }
    }
    for (const [phaseId, lost] of byPhaseKind) {
      const label = PHASE_DISPLAY_LABEL[phaseId];
      const current = phaseTotals.get(label) ?? { lost: 0, count: 0 };
      phaseTotals.set(label, { lost: current.lost + lost, count: current.count + 1 });
    }
  }

  return {
    analyzedCount: analyses.length,
    phases: toEntries(phaseTotals),
    cases: toEntries(caseTotals),
  };
}
