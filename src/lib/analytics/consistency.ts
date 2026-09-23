import { PHASES, avg, covariance, quantile, sd, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Consistency Lab. Your solve-to-solve spread isn't one number — it's the
 * sum of each phase's wobble. The variance of the total splits exactly
 * into each phase's covariance with the total (Var T = Σ Cov(Pᵢ, T)), so
 * every phase gets a share of your inconsistency that adds up to 100%.
 *
 * Then the what-if, computed on your own solves rather than assumed: shrink
 * one phase's deviations until it's as steady (relative to its length) as
 * your steadiest phase, keep everything else as it actually happened, and
 * measure what your spread would have been.
 */

export interface PhaseSpread {
  phase: PhaseName;
  mean: number;
  sd: number;
  /** Coefficient of variation: spread relative to the phase's own length. */
  cv: number;
  p10: number;
  p50: number;
  p90: number;
  /** Share of total variance this phase accounts for (sums to 1 across phases; can be negative). */
  share: number;
}

export interface WhatIf {
  phase: PhaseName;
  sd: number;
  dropMs: number;
}

export interface ConsistencyReport {
  solves: number;
  totalMean: number;
  totalSd: number;
  phases: PhaseSpread[];
  steadiest: PhaseName;
  wildest: PhaseName;
  whatIf: WhatIf[];
  headline: string;
}

export const MIN_SOLVES = 10;

export function buildConsistency(metrics: readonly SolveMetrics[]): ConsistencyReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const totals = metrics.map((m) => m.phases.reduce((a, b) => a + b, 0));
  const totalVar = sd(totals) ** 2;
  if (totalVar <= 0) return null;

  const phases: PhaseSpread[] = PHASES.map((phase, i) => {
    const xs = metrics.map((m) => m.phases[i]);
    const mean = avg(xs);
    const s = sd(xs);
    return {
      phase,
      mean,
      sd: s,
      cv: mean > 0 ? s / mean : 0,
      p10: quantile(xs, 0.1),
      p50: quantile(xs, 0.5),
      p90: quantile(xs, 0.9),
      share: covariance(xs, totals) / totalVar,
    };
  });

  // Relative spread means little for a phase that's often near zero (a skipped
  // PLL), so the benchmark is the steadiest phase that's at least a second long.
  const substantial = phases.filter((p) => p.mean >= 1000);
  const steadiest = [...(substantial.length ? substantial : phases)].sort((a, b) => a.cv - b.cv)[0];
  const wildest = [...phases].sort((a, b) => b.share - a.share)[0];

  const whatIf: WhatIf[] = phases
    .map((p, i) => {
      const k = p.sd > 0 ? Math.min(1, (steadiest.cv * p.mean) / p.sd) : 1;
      const adjusted = metrics.map((m, j) => totals[j] - (1 - k) * (m.phases[i] - p.mean));
      const newSd = sd(adjusted);
      return { phase: p.phase, sd: newSd, dropMs: Math.sqrt(totalVar) - newSd };
    })
    .sort((a, b) => b.dropMs - a.dropMs);

  const best = whatIf[0];
  const headline =
    `${Math.round(wildest.share * 100)}% of your inconsistency comes from ${wildest.phase}.` +
    (best && best.dropMs > 20 && best.phase !== steadiest.phase
      ? ` If your ${best.phase} were as steady as your ${steadiest.phase}, your spread would drop from ${(Math.sqrt(totalVar) / 1000).toFixed(2)}s to ${(best.sd / 1000).toFixed(2)}s.`
      : "");

  return {
    solves: metrics.length,
    totalMean: avg(totals),
    totalSd: Math.sqrt(totalVar),
    phases,
    steadiest: steadiest.phase,
    wildest: wildest.phase,
    whatIf,
    headline,
  };
}
