"use client";

import type { PredictionWorkerRequest, PredictionWorkerResponse } from "./worker";
import {
  cachePredictionModel,
  peekPredictionModel,
  predictionModelFor,
  seedScrambleFeatures,
  type PredictionTrainingSet,
  type TrainedPredictionModel,
} from "@/lib/analysis/prediction";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: PredictionWorkerResponse & { ok: true }) => void; reject: (e: Error) => void }>();
/** One training per distinct history at a time, however many components ask for it. */
const inFlight = new Map<string, Promise<TrainedPredictionModel>>();
const listeners = new Set<() => void>();

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL("./worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<PredictionWorkerResponse>) => {
      const res = e.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res);
      else p.reject(new Error(res.message));
    };
    w.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message || "Prediction worker failed"));
      pending.clear();
      worker = null;
    };
    worker = w;
  }
  return worker;
}

function trainInWorker(set: PredictionTrainingSet): Promise<PredictionWorkerResponse & { ok: true }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, set } satisfies PredictionWorkerRequest);
  });
}

/** Subscribe to "a model finished training" — for useSyncExternalStore. */
export function subscribePredictionModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Trains the model for `set` off the main thread and caches it (along with
 * the scramble features it computed) so peekPredictionModel and the
 * synchronous predictSolveTime both find it. Resolves immediately when this
 * history has been trained before. Falls back to training here, when the
 * browser is idle, if the worker can't run.
 */
export function requestPredictionModel(set: PredictionTrainingSet): Promise<TrainedPredictionModel> {
  const cached = peekPredictionModel(set.key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(set.key);
  if (running) return running;

  const job = trainInWorker(set)
    .then((res) => {
      seedScrambleFeatures(res.features);
      return cachePredictionModel(set.key, res.model);
    })
    .catch(
      () =>
        new Promise<TrainedPredictionModel>((resolve) => {
          const run = () => resolve(predictionModelFor(set));
          if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1000 });
          else setTimeout(run, 0);
        }),
    )
    .finally(() => {
      inFlight.delete(set.key);
      for (const l of listeners) l();
    });
  inFlight.set(set.key, job);
  return job;
}
