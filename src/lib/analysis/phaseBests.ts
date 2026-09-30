import type { SolveMetrics } from "@/lib/analytics/solveMetrics";

/**
 * Your best-ever time on each of the four phases — Cross, F2L, OLL, PLL —
 * and what they add up to: the solve you've already proven you can do, just
 * never all at once. A phase that beats its best is a "gold", as in a
 * speedrunner's splits.
 *
 * Skipped OLLs and PLLs are the scramble's gift, not a time you earned, so
 * they're left out of both the bests and the gold check.
 */

export const MIN_PHASE_SAMPLES = 5;

export interface PhaseBests {
  /** Best time per phase in ms (Cross, F2L, OLL, PLL); null until there are enough real attempts at it. */
  bests: (number | null)[];
  /** The four bests added up, or null while any is missing. */
  sumOfBestMs: number | null;
}

export function buildPhaseBests(metrics: readonly SolveMetrics[]): PhaseBests {
  const bests = [0, 1, 2, 3].map((i) => {
    const xs = metrics
      .filter((m) => !(i === 2 && m.ollSkip) && !(i === 3 && m.pllSkip))
      .map((m) => m.phases[i])
      .filter((v) => Number.isFinite(v) && v > 0);
    return xs.length < MIN_PHASE_SAMPLES ? null : Math.min(...xs);
  });
  return { bests, sumOfBestMs: bests.every((b) => b !== null) ? (bests as number[]).reduce((a, b) => a + b, 0) : null };
}

export interface PhaseGold {
  phase: 0 | 1 | 2 | 3;
  ms: number;
  /** How far under the previous best (positive). */
  underBy: number;
}

/** Which finished phases beat their best. `skips` marks phases the scramble skipped, which never count. */
export function findGolds(durations: readonly (number | null)[], bests: readonly (number | null)[], skips: readonly boolean[] = []): PhaseGold[] {
  const out: PhaseGold[] = [];
  durations.forEach((ms, i) => {
    const best = bests[i];
    if (ms === null || best === null || best === undefined || skips[i] || ms <= 0) return;
    if (ms < best) out.push({ phase: i as 0 | 1 | 2 | 3, ms, underBy: best - ms });
  });
  return out;
}

/** A finished phase against its best: negative = under (a gold), positive = over. Null when there's no fair comparison. */
export function deltaToBest(ms: number | null, best: number | null | undefined, skipped = false): number | null {
  if (ms === null || best === null || best === undefined || skipped || ms <= 0) return null;
  return ms - best;
}
