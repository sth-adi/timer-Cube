/**
 * Predictive solve-time model: fits a linear regression from cheap scramble
 * difficulty features (see scrambleFeatures.ts) to actual solve times, using
 * only the current session's own history — no server, no shared model, just
 * "how have *you* done on scrambles shaped like this one."
 */

import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { fitLinearRegression, predict, probabilityBelow, type RegressionFit } from "./linearRegression";
import { computeScrambleFeatures, featureVector } from "./scrambleFeatures";

export interface SolvePrediction {
  fit: RegressionFit;
  predictedMs: number;
  /** Rough probability this solve beats the current session PB single, given the model's residual spread. */
  pbProbability: number | null;
}

const MAX_TRAINING_SOLVES = 300;

/**
 * Trains on every non-DNF, non-event-tagged solve in `solves` (same
 * "normal solves only" convention as PB tracking and achievements — an OH
 * or BLD time would only confuse a model meant to predict ordinary pace),
 * then predicts for `scramble`. Returns null until there's enough history
 * for fitLinearRegression to trust the fit.
 */
export function predictSolveTime(solves: readonly Solve[], scramble: string): SolvePrediction | null {
  if (!scramble) return null;

  // The PB target comes from *all* history — it has to match what the app
  // considers your actual current best (see computeSessionStats) — but
  // training the regression only looks at the most recent solves: recent
  // form predicts the next solve better than a years-old warm-up, and it
  // keeps the per-scramble cross solve from ever costing more than a few
  // tens of milliseconds even with a session of thousands of solves.
  let bestMs = Infinity;
  for (const solve of solves) {
    const finalMs = solveFinalMs(solve);
    if (finalMs !== null && finalMs < bestMs) bestMs = finalMs;
  }

  const recent = solves.length > MAX_TRAINING_SOLVES ? solves.slice(-MAX_TRAINING_SOLVES) : solves;
  const rows: { features: number[]; ms: number }[] = [];
  for (const solve of recent) {
    const finalMs = solveFinalMs(solve);
    if (finalMs === null) continue; // DNF
    if (!solve.scramble) continue;
    rows.push({ features: featureVector(computeScrambleFeatures(solve.scramble)), ms: finalMs });
  }

  const fit = fitLinearRegression(
    rows.map((r) => r.features),
    rows.map((r) => r.ms),
  );
  if (!fit) return null;

  const currentFeatures = featureVector(computeScrambleFeatures(scramble));
  const predictedMs = Math.max(0, predict(fit, currentFeatures));
  const pbProbability = Number.isFinite(bestMs) ? probabilityBelow(fit, predictedMs, bestMs) : null;

  return { fit, predictedMs, pbProbability };
}
