import type { Solve } from "@/types";
import { avg, quantile } from "@/lib/analytics/solveMetrics";

/**
 * Momentum Meter: a hot-hand test for solve times. Groups solves into
 * sittings the same way Warm-up & Fatigue does (a gap of SITTING_GAP_MS or
 * more starts a new sitting), places each solve relative to its own
 * sitting's median time (so a good day and a bad day compare fairly, and a
 * warm-up or fatigue trend doesn't get mistaken for momentum), then asks:
 * does the solve right after a faster-than-usual one tend to be faster too,
 * or is each solve close to independent of the last?
 *
 * Deliberately doesn't need a smart-cube reconstruction — total time alone
 * is enough — so it works on every timed solve, keyboard included.
 */

export const SITTING_GAP_MS = 15 * 60_000;
const MIN_SITTING = 5;
export const MIN_PAIRS = 30;
const GAP_THRESHOLD = 0.04;

export interface RelSolve {
  id: string;
  date: number;
  /** Time relative to its sitting's median (-0.1 = 10% faster than that sitting's typical solve). */
  rel: number;
}

/** Groups (sorted, non-DNF) solves into sittings of at least MIN_SITTING, then places each relative to its sitting's median time. Pure — no cube logic, so hand-testable without a scramble. */
export function relativeSittings(solves: readonly Solve[]): RelSolve[][] {
  const clean = solves.filter((s) => s.penalty !== "dnf").sort((a, b) => a.date - b.date);
  const groups: Solve[][] = [];
  for (const s of clean) {
    const cur = groups[groups.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && s.date - s.timeMs - prev.date < SITTING_GAP_MS) cur.push(s);
    else groups.push([s]);
  }
  return groups
    .filter((g) => g.length >= MIN_SITTING)
    .map((g) => {
      const med = quantile(
        g.map((s) => s.timeMs),
        0.5,
      );
      return g.map((s) => ({ id: s.id, date: s.date, rel: med > 0 ? s.timeMs / med - 1 : 0 }));
    });
}

export interface MomentumReport {
  pairs: number;
  /** Average rel of the solve right after a faster-than-median one. */
  afterFastAvgRel: number;
  /** Average rel of the solve right after a slower-than-median one. */
  afterSlowAvgRel: number;
  /** afterSlowAvgRel - afterFastAvgRel: positive means fast solves genuinely cluster. */
  gapPts: number;
  hasMomentum: boolean;
  headline: string;
}

const pct = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;

/** Aggregates already-placed sittings into the report — split out so the maths is testable without solves. */
export function summarizeMomentum(sittings: readonly RelSolve[][]): MomentumReport | null {
  const afterFast: number[] = [];
  const afterSlow: number[] = [];
  for (const sitting of sittings) {
    for (let i = 0; i < sitting.length - 1; i++) {
      (sitting[i].rel < 0 ? afterFast : afterSlow).push(sitting[i + 1].rel);
    }
  }
  const pairs = afterFast.length + afterSlow.length;
  if (pairs < MIN_PAIRS || afterFast.length < 10 || afterSlow.length < 10) return null;

  const afterFastAvgRel = avg(afterFast);
  const afterSlowAvgRel = avg(afterSlow);
  const gapPts = afterSlowAvgRel - afterFastAvgRel;
  const hasMomentum = gapPts >= GAP_THRESHOLD;

  const parts = [`The solve right after a faster-than-usual one averages ${pct(afterFastAvgRel)} vs its own sitting's median, versus ${pct(afterSlowAvgRel)} after a slower one.`];
  parts.push(
    hasMomentum
      ? "Fast solves tend to cluster — you carry momentum from one into the next."
      : "That's close enough to call each solve independent of the last — no real momentum either way.",
  );

  return { pairs, afterFastAvgRel, afterSlowAvgRel, gapPts, hasMomentum, headline: parts.join(" ") };
}

export function buildMomentum(solves: readonly Solve[]): MomentumReport | null {
  return summarizeMomentum(relativeSittings(solves));
}
