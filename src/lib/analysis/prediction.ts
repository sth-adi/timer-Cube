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

export interface PredictionSkill {
  /** Solves the model was scored on — each predicted using only the solves before it. */
  testSize: number;
  /** Mean absolute error of the model on those solves (ms). */
  modelMaeMs: number;
  /** Mean absolute error of just predicting your average of the previous BASELINE_WINDOW solves (ms). */
  baselineMaeMs: number;
  /** Whether the model beats that baseline by at least MIN_IMPROVEMENT. */
  useful: boolean;
}

export interface SolvePrediction {
  fit: RegressionFit;
  predictedMs: number;
  /**
   * Rough probability this solve beats the current session PB single, given
   * the model's residual spread — null unless the model has shown it predicts
   * better than your recent average on solves it wasn't trained on.
   */
  pbProbability: number | null;
  /** How the model did on your later solves; null until there's enough history to check. */
  skill: PredictionSkill | null;
}

const MAX_TRAINING_SOLVES = 300;
/** The honest alternative: "you'll probably do about your average of the last dozen". */
export const BASELINE_WINDOW = 12;
/** Latest share of solves held out for scoring, and the fewest that makes a verdict. */
const HOLDOUT_FRACTION = 0.3;
const MIN_TEST = 10;
/** The model must cut the baseline's error by at least this share to be shown. */
export const MIN_IMPROVEMENT = 0.05;

/**
 * Backtests the model the way it's used: for each of your latest solves,
 * fit on only the solves before it and predict it, and compare against
 * simply predicting the average of the BASELINE_WINDOW solves before it.
 * A scramble model that can't beat "your recent average" isn't telling you
 * anything about the scramble, so its precise-looking numbers stay hidden.
 */
export function evaluatePrediction(rows: readonly { features: number[]; ms: number }[]): PredictionSkill | null {
  const n = rows.length;
  const testSize = Math.max(MIN_TEST, Math.round(n * HOLDOUT_FRACTION));
  let modelErr = 0;
  let baseErr = 0;
  let scored = 0;
  for (let i = n - testSize; i < n; i++) {
    if (i < BASELINE_WINDOW) continue;
    const history = rows.slice(0, i);
    const fit = fitLinearRegression(
      history.map((r) => r.features),
      history.map((r) => r.ms),
    );
    if (!fit) continue;
    const recent = history.slice(-BASELINE_WINDOW);
    const baseline = recent.reduce((a, r) => a + r.ms, 0) / recent.length;
    modelErr += Math.abs(Math.max(0, predict(fit, rows[i].features)) - rows[i].ms);
    baseErr += Math.abs(baseline - rows[i].ms);
    scored++;
  }
  if (scored < MIN_TEST) return null;
  const modelMaeMs = modelErr / scored;
  const baselineMaeMs = baseErr / scored;
  return { testSize: scored, modelMaeMs, baselineMaeMs, useful: modelMaeMs <= baselineMaeMs * (1 - MIN_IMPROVEMENT) };
}

/**
 * Trains on every non-DNF, non-event-tagged solve in `solves` (same
 * "normal solves only" convention as PB tracking and achievements — an OH
 * or BLD time would only confuse a model meant to predict ordinary pace),
 * then predicts for `scramble`. Returns null until there's enough history
 * for fitLinearRegression to trust the fit. Callers should only show the
 * prediction when `skill.useful` — see evaluatePrediction.
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

  const skill = evaluatePrediction(rows);
  const currentFeatures = featureVector(computeScrambleFeatures(scramble));
  const predictedMs = Math.max(0, predict(fit, currentFeatures));
  const pbProbability = skill?.useful && Number.isFinite(bestMs) ? probabilityBelow(fit, predictedMs, bestMs) : null;

  return { fit, predictedMs, pbProbability, skill };
}
