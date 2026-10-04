import { caseStats, solveCases, type CaseGroup, type CaseOccurrence } from "@/lib/analysis/caseHistory";
import type { Solve } from "@/types";

/** A case needs at least this many past occurrences before its average is trusted enough to flag as "weak". */
export const MIN_CASE_OCCURRENCES = 3;
/** A case's own average total time (recognition + execution) needs to run at least this much over the group average to count as a weak case. */
export const WEAK_CASE_RATIO = 1.3;

export interface WeakCases {
  oll: ReadonlySet<string>;
  pll: ReadonlySet<string>;
}

/** Which of a group's cases run meaningfully slower than your own average for the group. */
function weakSet(occurrences: readonly CaseOccurrence[], group: CaseGroup): Set<string> {
  const stats = caseStats(occurrences, group, occurrences.length).filter((s) => s.count >= MIN_CASE_OCCURRENCES);
  if (stats.length === 0) return new Set<string>();
  const avgMs = stats.reduce((sum, s) => sum + s.totalMs, 0) / stats.length;
  return new Set(stats.filter((s) => s.totalMs > avgMs * WEAK_CASE_RATIO).map((s) => s.name));
}

export function weakCasesFromOccurrences(occurrences: readonly CaseOccurrence[]): WeakCases {
  return { oll: weakSet(occurrences, "OLL"), pll: weakSet(occurrences, "PLL") };
}

/**
 * A cheap fingerprint of the part of the history the case analysis reads: how many solves, the
 * newest one, and how many of them have a usable reconstruction (a DNF or a missing recording
 * drops out). Renaming a solve or editing a comment doesn't change it, so it doesn't invalidate.
 */
export function solvesRevision(solves: readonly Solve[]): string {
  let usable = 0;
  for (const s of solves) if (s.reconstruction && s.moveTimestamps && s.penalty !== "dnf") usable++;
  const last = solves[solves.length - 1];
  return `${solves.length}:${last?.id ?? ""}:${usable}`;
}

let cached: { revision: string; sets: WeakCases } | null = null;

/** The result for this revision if it was already worked out, else null — never computes. */
export function peekWeakCases(revision: string): WeakCases | null {
  return cached && cached.revision === revision ? cached.sets : null;
}

/**
 * Your slow OLL/PLL cases from all-time history. This replays every solve's reconstruction, so it
 * is only called once a case badge is about to name a case, and remembered per revision: the
 * same history is never worked through twice.
 */
export function weakCasesFor(solves: readonly Solve[], revision: string = solvesRevision(solves)): WeakCases {
  const hit = peekWeakCases(revision);
  if (hit) return hit;
  const sets = weakCasesFromOccurrences(solves.flatMap(solveCases));
  cached = { revision, sets };
  return sets;
}
