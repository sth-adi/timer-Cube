import type { Solve } from "@/types";
import { caseStats, solveCases, type CaseGroup, type CaseStat } from "@/lib/analysis/caseHistory";

/**
 * Bottleneck Report: for every OLL/PLL/F2L case you've had often enough to
 * mean something, is the time recognition (you know the algorithm, you're
 * slow to see the case) or execution (you see it fine, the fingers are
 * slow)? A thin classifier over Case History's own recognition/execution
 * split — no new replay logic, just a different lens on data it already
 * computes — ranked by how much total time each case has actually cost.
 */

export type BottleneckKind = "recognition" | "execution" | "balanced";

export interface CaseBottleneck {
  group: CaseGroup;
  key: string;
  name: string;
  count: number;
  recognitionMs: number;
  executionMs: number;
  totalMs: number;
  /** recognitionMs / totalMs. */
  recognitionShare: number;
  kind: BottleneckKind;
  /** totalMs * count — cumulative time this case has cost across every occurrence. */
  costMs: number;
}

/** Fewest times a case must have come up before it's worth classifying. */
export const MIN_OCCURRENCES = 3;
/** Fewest classified cases before the report means anything. */
export const MIN_CASES = 5;
const DOMINANCE_THRESHOLD = 0.6;

export function classifyBottleneck(recognitionMs: number, executionMs: number): BottleneckKind {
  const total = recognitionMs + executionMs;
  if (total <= 0) return "balanced";
  const share = recognitionMs / total;
  if (share >= DOMINANCE_THRESHOLD) return "recognition";
  if (share <= 1 - DOMINANCE_THRESHOLD) return "execution";
  return "balanced";
}

/** Turns already-computed CaseStat rows into bottleneck classifications, most expensive case first. Pure — testable with hand-built stats, no solves needed. */
export function rankBottlenecks(stats: readonly CaseStat[]): CaseBottleneck[] {
  return stats
    .filter((s) => s.count >= MIN_OCCURRENCES)
    .map((s) => ({
      group: s.group,
      key: s.key,
      name: s.name,
      count: s.count,
      recognitionMs: s.recognitionMs,
      executionMs: s.executionMs,
      totalMs: s.totalMs,
      recognitionShare: s.totalMs > 0 ? s.recognitionMs / s.totalMs : 0,
      kind: classifyBottleneck(s.recognitionMs, s.executionMs),
      costMs: s.totalMs * s.count,
    }))
    .sort((a, b) => b.costMs - a.costMs);
}

export interface BottleneckReport {
  cases: CaseBottleneck[];
  recognitionBound: CaseBottleneck[];
  executionBound: CaseBottleneck[];
  headline: string;
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

/** Aggregates already-ranked bottlenecks into the report. Pure — testable without solves. */
export function summarizeBottlenecks(cases: readonly CaseBottleneck[]): BottleneckReport | null {
  if (cases.length < MIN_CASES) return null;
  const recognitionBound = cases.filter((c) => c.kind === "recognition");
  const executionBound = cases.filter((c) => c.kind === "execution");

  const parts: string[] = [];
  if (recognitionBound.length && executionBound.length) {
    parts.push(`${recognitionBound.length} of your ${cases.length} tracked cases are recognition-bound, ${executionBound.length} are execution-bound.`);
  } else if (recognitionBound.length) {
    parts.push("Your slow cases are almost all recognition-bound — the algorithms are fine, seeing the case is what costs you.");
  } else if (executionBound.length) {
    parts.push("Your slow cases are almost all execution-bound — you see them fine, the fingers are the bottleneck.");
  } else {
    parts.push("No case leans hard either way — recognition and execution cost you about the same across the board.");
  }
  const worst = cases[0];
  parts.push(`${worst.name} costs you the most overall — ${secs(worst.totalMs)}s × ${worst.count} times — and it's ${worst.kind === "balanced" ? "split evenly" : `mostly ${worst.kind}`}.`);

  return { cases: [...cases], recognitionBound, executionBound, headline: parts.join(" ") };
}

export function analyzeBottlenecks(solves: readonly Solve[]): BottleneckReport | null {
  const occurrences = solves.flatMap(solveCases);
  const groups: CaseGroup[] = ["OLL", "PLL", "F2L"];
  const stats = groups.flatMap((group) => {
    const total = occurrences.filter((o) => o.group === group).length;
    return caseStats(occurrences, group, total);
  });
  return summarizeBottlenecks(rankBottlenecks(stats));
}
