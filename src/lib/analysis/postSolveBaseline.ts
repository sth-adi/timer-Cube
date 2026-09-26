import { quantile, type SolveMetrics } from "@/lib/analytics/solveMetrics";

/**
 * "F2L: 5.20s" means nothing on its own — every one of the Lab's 40 reports
 * compares a number against your own history, but the post-solve screen
 * itself (the one thing shown after *every single* solve) never did. This
 * gives it the same reference point, at the same granularity as the table
 * already renders: Cross, then each F2L pair *in the order you solve them*
 * (not physical slot — see PostSolvePhaseRow's own doc comment; solve order
 * is also what SolveMetrics.segments is built in, so index lines up with a
 * post-solve row's position directly), then OLL, then PLL.
 */

export interface PhaseBaseline {
  medianMs: number;
  /** Your own 25th-percentile for this segment — "a good one", not your single best (too noisy to chase every time). */
  goodMs: number;
}

export interface PostSolveBaseline {
  /** [cross, pair1, pair2, pair3, pair4, oll, pll] — index i matches a post-solve row at position i. */
  segments: (PhaseBaseline | null)[];
  /** [cross, F2L, OLL, PLL] as whole phases — for the live splits during a solve. */
  phases: (PhaseBaseline | null)[];
}

export const MIN_SOLVES = 15;
const SEGMENT_COUNT = 7;

/** Per-segment history, gated per segment (a solve that skipped OLL contributes to every other segment but not that one). */
export function buildPostSolveBaseline(metrics: readonly SolveMetrics[]): PostSolveBaseline | null {
  if (metrics.length < MIN_SOLVES) return null;
  const segments: (PhaseBaseline | null)[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const xs = metrics.map((m) => m.segments[i]).filter((v): v is number => Number.isFinite(v) && v > 0);
    segments.push(xs.length < MIN_SOLVES ? null : { medianMs: quantile(xs, 0.5), goodMs: quantile(xs, 0.25) });
  }
  const phases: (PhaseBaseline | null)[] = [0, 1, 2, 3].map((i) => {
    const xs = metrics.map((m) => m.phases[i]).filter((v) => Number.isFinite(v) && v > 0);
    return xs.length < MIN_SOLVES ? null : { medianMs: quantile(xs, 0.5), goodMs: quantile(xs, 0.25) };
  });
  return { segments, phases };
}

export type Pace = "fast" | "normal" | "slow";

/** How `ms` reads against its own baseline — null when either is missing (too little history, or this row has no time yet). */
export function paceFor(ms: number | null, baseline: PhaseBaseline | null, slowRatio = 1.3): Pace | null {
  if (ms === null || !baseline || baseline.medianMs <= 0) return null;
  if (ms <= baseline.goodMs) return "fast";
  if (ms > baseline.medianMs * slowRatio) return "slow";
  return "normal";
}
