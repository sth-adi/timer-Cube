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

/** One training example: a solve's scramble and its final time. */
export interface PredictionSample {
  scramble: string;
  ms: number;
}

/**
 * The part of the model that depends only on your history, not on the
 * scramble on screen: the fitted regression and its backtest. This is the
 * expensive part (a cross solve per training scramble plus a refit per
 * held-out solve), so it is cached by `PredictionTrainingSet.key` and can be
 * trained off the main thread (see lib/prediction/worker.ts).
 */
export interface TrainedPredictionModel {
  fit: RegressionFit | null;
  skill: PredictionSkill | null;
}

export interface PredictionTrainingSet {
  /** Exact fingerprint of `samples` — two sets with the same key train to the same model. */
  key: string;
  samples: PredictionSample[];
  /** Best non-DNF time over *all* the solves, the PB the probability is measured against. */
  bestMs: number;
}

/**
 * Picks the training data out of `solves` — cheap, no scramble analysis.
 *
 * The PB target comes from *all* history — it has to match what the app
 * considers your actual current best (see computeSessionStats) — but
 * training the regression only looks at the most recent solves: recent
 * form predicts the next solve better than a years-old warm-up, and it
 * keeps the per-scramble cross solve from ever costing more than a few
 * tens of milliseconds even with a session of thousands of solves.
 */
export function predictionTrainingSet(solves: readonly Solve[]): PredictionTrainingSet {
  let bestMs = Infinity;
  for (const solve of solves) {
    const finalMs = solveFinalMs(solve);
    if (finalMs !== null && finalMs < bestMs) bestMs = finalMs;
  }

  const recent = solves.length > MAX_TRAINING_SOLVES ? solves.slice(-MAX_TRAINING_SOLVES) : solves;
  const samples: PredictionSample[] = [];
  const keyParts: string[] = [];
  for (const solve of recent) {
    const finalMs = solveFinalMs(solve);
    if (finalMs === null) continue; // DNF
    if (!solve.scramble) continue;
    samples.push({ scramble: solve.scramble, ms: finalMs });
    keyParts.push(`${finalMs}:${solve.scramble}`);
  }
  return { key: keyParts.join("\n"), samples, bestMs };
}

/** Bounded insertion-order cache: re-setting a key moves it to the back, the oldest entry goes first. */
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): V {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
  return value;
}

/**
 * A scramble's features never change, and the same few hundred scrambles are
 * re-read every time the model retrains — so each is analysed once.
 */
const featureCache = new Map<string, number[]>();
const MAX_CACHED_FEATURES = 5000;

export function scrambleFeatureVector(scramble: string): number[] {
  return featureCache.get(scramble) ?? remember(featureCache, scramble, featureVector(computeScrambleFeatures(scramble)), MAX_CACHED_FEATURES);
}

/** Hands this thread feature vectors another thread (the prediction worker) already computed. */
export function seedScrambleFeatures(entries: readonly (readonly [string, number[]])[]): void {
  for (const [scramble, vector] of entries) {
    if (!featureCache.has(scramble)) remember(featureCache, scramble, vector, MAX_CACHED_FEATURES);
  }
}

/** Fits and backtests the regression on `samples` — the expensive, history-only half of predictSolveTime. */
export function trainPredictionModel(samples: readonly PredictionSample[]): TrainedPredictionModel {
  const rows = samples.map((s) => ({ features: scrambleFeatureVector(s.scramble), ms: s.ms }));
  const fit = fitLinearRegression(
    rows.map((r) => r.features),
    rows.map((r) => r.ms),
  );
  if (!fit) return { fit: null, skill: null };
  return { fit, skill: evaluatePrediction(rows) };
}

/** Trained models by training-set key — a handful covers every event and view showing a prediction at once. */
const modelCache = new Map<string, TrainedPredictionModel>();
const MAX_CACHED_MODELS = 16;

/** The cached model for `key`, if one has been trained; never trains. */
export function peekPredictionModel(key: string): TrainedPredictionModel | undefined {
  return modelCache.get(key);
}

/** Stores a model trained elsewhere (e.g. in the prediction worker) under its training-set key. */
export function cachePredictionModel(key: string, model: TrainedPredictionModel): TrainedPredictionModel {
  return remember(modelCache, key, model, MAX_CACHED_MODELS);
}

/** The model for `set`, trained now only if no identical history has been trained on before. */
export function predictionModelFor(set: PredictionTrainingSet): TrainedPredictionModel {
  return modelCache.get(set.key) ?? cachePredictionModel(set.key, trainPredictionModel(set.samples));
}

/** The cheap, per-scramble half of predictSolveTime: applies a trained model to the scramble on screen. */
export function predictWithModel(model: TrainedPredictionModel, scramble: string, bestMs: number): SolvePrediction | null {
  if (!scramble) return null;
  const { fit, skill } = model;
  if (!fit) return null;
  const predictedMs = Math.max(0, predict(fit, scrambleFeatureVector(scramble)));
  const pbProbability = skill?.useful && Number.isFinite(bestMs) ? probabilityBelow(fit, predictedMs, bestMs) : null;
  return { fit, predictedMs, pbProbability, skill };
}

/**
 * Trains on every non-DNF, non-event-tagged solve in `solves` (same
 * "normal solves only" convention as PB tracking and achievements — an OH
 * or BLD time would only confuse a model meant to predict ordinary pace),
 * then predicts for `scramble`. Returns null until there's enough history
 * for fitLinearRegression to trust the fit. Callers should only show the
 * prediction when `skill.useful` — see evaluatePrediction.
 *
 * Synchronous, but cached: the training only reruns when the training
 * history actually changes, and each scramble is analysed once. Components
 * should prefer useSolvePrediction (lib/prediction/useSolvePrediction.ts),
 * which trains in a worker and never blocks a frame.
 */
export function predictSolveTime(solves: readonly Solve[], scramble: string): SolvePrediction | null {
  if (!scramble) return null;
  const set = predictionTrainingSet(solves);
  return predictWithModel(predictionModelFor(set), scramble, set.bestMs);
}
