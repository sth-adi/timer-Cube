"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Solve } from "@/types";
import {
  peekPredictionModel,
  predictionTrainingSet,
  predictWithModel,
  type SolvePrediction,
  type TrainedPredictionModel,
} from "@/lib/analysis/prediction";
import { requestPredictionModel, subscribePredictionModels } from "./client";

const noModel = () => undefined;

/**
 * predictSolveTime for components, without the main-thread training: the
 * model for `trainingSolves` is trained in the prediction worker and cached
 * by an exact fingerprint of the history it learns from, so it only
 * retrains when that history actually changes. Until a new model arrives,
 * the last one this component had keeps predicting (applying a trained
 * model to a scramble is cheap), so nothing blinks out after a solve.
 */
export function useSolvePrediction(trainingSolves: readonly Solve[], scramble: string): SolvePrediction | null {
  const set = useMemo(() => predictionTrainingSet(trainingSolves), [trainingSolves]);
  const ready = useSyncExternalStore(subscribePredictionModels, () => peekPredictionModel(set.key), noModel);

  // The last model this component had, shown while a newer one trains.
  const [shown, setShown] = useState<TrainedPredictionModel | undefined>(ready);
  if (ready && ready !== shown) setShown(ready);
  const model = ready ?? shown;

  useEffect(() => {
    if (!peekPredictionModel(set.key)) void requestPredictionModel(set);
  }, [set]);

  return useMemo(() => (model ? predictWithModel(model, scramble, set.bestMs) : null), [model, scramble, set.bestMs]);
}
