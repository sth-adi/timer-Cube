/// <reference lib="webworker" />
import { predictionModelFor, scrambleFeatureVector, type PredictionTrainingSet, type TrainedPredictionModel } from "../analysis/prediction";

export type PredictionWorkerRequest = { id: number; set: PredictionTrainingSet };
export type PredictionWorkerResponse =
  | { id: number; ok: true; model: TrainedPredictionModel; features: [string, number[]][] }
  | { id: number; ok: false; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * The predictive model's own worker: training means an optimal cross solve
 * for each of up to 300 scrambles plus a refit per held-out solve — tens of
 * milliseconds that used to land on the main thread right after every
 * solve. The worker keeps its own feature and model caches, so after the
 * first training a new solve only costs one new scramble analysis plus the
 * backtest.
 */
ctx.onmessage = (e: MessageEvent<PredictionWorkerRequest>) => {
  const { id, set } = e.data;
  try {
    const model = predictionModelFor(set);
    // Hand the scramble features back too (they're already cached here), so
    // the main thread's own synchronous predictSolveTime never has to redo them.
    const features = set.samples.map((s): [string, number[]] => [s.scramble, scrambleFeatureVector(s.scramble)]);
    ctx.postMessage({ id, ok: true, model, features } satisfies PredictionWorkerResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies PredictionWorkerResponse);
  }
};
