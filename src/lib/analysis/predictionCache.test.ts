import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Solve } from "@/types";

// Count the expensive calls without changing what they return.
vi.mock("./scrambleFeatures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./scrambleFeatures")>();
  return { ...actual, computeScrambleFeatures: vi.fn(actual.computeScrambleFeatures) };
});
vi.mock("./linearRegression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./linearRegression")>();
  return { ...actual, fitLinearRegression: vi.fn(actual.fitLinearRegression) };
});

import { computeScrambleFeatures } from "./scrambleFeatures";
import { fitLinearRegression } from "./linearRegression";
import { peekPredictionModel, predictionTrainingSet, predictSolveTime, trainPredictionModel, predictWithModel } from "./prediction";

function makeScramble(seed: number, length: number): string {
  const faces = ["U", "D", "L", "R", "F", "B"];
  const suffixes = ["", "'", "2"];
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) & 0x7fffffff);
  return Array.from({ length }, () => faces[rand() % 6] + suffixes[rand() % 3]).join(" ");
}

let nextSeed = 1000;
/** Fresh scrambles per test, so one test's cache can't satisfy another's. */
function makeSolves(n: number): Solve[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${nextSeed}-${i}`,
    sessionId: "s1",
    timeMs: 9000 + ((i * 37) % 3000),
    penalty: "none" as const,
    scramble: makeScramble(nextSeed++, 20),
    date: i,
  }));
}

const features = vi.mocked(computeScrambleFeatures);
const fits = vi.mocked(fitLinearRegression);

describe("prediction caching", () => {
  beforeEach(() => {
    features.mockClear();
    fits.mockClear();
  });

  it("doesn't retrain for an unchanged history, even through a fresh array or a new scramble", () => {
    const solves = makeSolves(60);
    const target = makeScramble(nextSeed++, 20);
    const first = predictSolveTime(solves, target);
    expect(features).toHaveBeenCalledTimes(61); // 60 training scrambles + the one on screen
    const fitsAfterFirst = fits.mock.calls.length;
    expect(fitsAfterFirst).toBeGreaterThan(1); // the fit plus the backtest refits

    features.mockClear();
    fits.mockClear();
    // Same content, new array (what a store update / filter produces).
    expect(predictSolveTime([...solves], target)).toEqual(first);
    expect(features).not.toHaveBeenCalled();
    expect(fits).not.toHaveBeenCalled();

    // A new scramble only analyses that scramble.
    predictSolveTime(solves, makeScramble(nextSeed++, 20));
    expect(features).toHaveBeenCalledTimes(1);
    expect(fits).not.toHaveBeenCalled();
  });

  it("retrains when the history changes, analysing only the new solve's scramble", () => {
    const solves = makeSolves(60);
    const target = makeScramble(nextSeed++, 20);
    predictSolveTime(solves, target);
    features.mockClear();
    fits.mockClear();

    const more = [...solves, ...makeSolves(1)];
    predictSolveTime(more, target);
    expect(features).toHaveBeenCalledTimes(1);
    expect(fits.mock.calls.length).toBeGreaterThan(0);

    // A changed time on an existing solve is a different history too.
    fits.mockClear();
    const edited = more.map((s, i) => (i === 3 ? { ...s, penalty: "plus2" as const } : s));
    expect(predictionTrainingSet(edited).key).not.toBe(predictionTrainingSet(more).key);
    predictSolveTime(edited, target);
    expect(fits.mock.calls.length).toBeGreaterThan(0);
  });

  it("gives identical results cached and uncached", () => {
    const solves = makeSolves(60);
    const target = makeScramble(nextSeed++, 20);
    const set = predictionTrainingSet(solves);
    const fresh = predictWithModel(trainPredictionModel(set.samples), target, set.bestMs);
    const viaCache = predictSolveTime(solves, target);
    expect(viaCache).toEqual(fresh);
    expect(peekPredictionModel(set.key)).toBeDefined();
  });
});
