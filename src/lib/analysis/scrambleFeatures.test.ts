import { describe, expect, it } from "vitest";
import { solveCrossOptimal } from "../solvers/cross";
import { computeScrambleFeatures, featureVector } from "./scrambleFeatures";

const SCRAMBLES = [
  "D2 R' U2 R2 B2 L2 F2 D' L2 D2 R2 U' B' L D' B2 R' U L' F2",
  "F2 L2 D B2 D' B2 U2 F2 R2 U2 L' F' D2 U L' B' R' D2 F'",
  "R U", // a trivially short scramble
];

describe("computeScrambleFeatures", () => {
  it("agrees with solveCrossOptimal on cross length", () => {
    for (const scramble of SCRAMBLES) {
      const features = computeScrambleFeatures(scramble);
      expect(features.crossLen).toBe(solveCrossOptimal(scramble).length);
    }
  });

  it("keeps every lower bound non-negative and the max no larger than the sum", () => {
    for (const scramble of SCRAMBLES) {
      const f = computeScrambleFeatures(scramble);
      expect(f.f2lLowerBoundSum).toBeGreaterThanOrEqual(0);
      expect(f.f2lMaxLowerBound).toBeGreaterThanOrEqual(0);
      expect(f.f2lMaxLowerBound).toBeLessThanOrEqual(f.f2lLowerBoundSum);
    }
  });

  it("scores a two-move scramble far below a heavily scrambled one", () => {
    const easy = computeScrambleFeatures(SCRAMBLES[2]);
    const hard = computeScrambleFeatures(SCRAMBLES[0]);
    expect(easy.crossLen).toBeLessThan(hard.crossLen);
    expect(easy.f2lLowerBoundSum).toBeLessThan(hard.f2lLowerBoundSum);
  });

  it("featureVector preserves a stable, matching order", () => {
    const f = { crossLen: 5, f2lLowerBoundSum: 12, f2lMaxLowerBound: 4 };
    expect(featureVector(f)).toEqual([5, 12, 4]);
  });
});
