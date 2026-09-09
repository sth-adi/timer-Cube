import { describe, expect, it } from "vitest";
import { fitLinearRegression, predict, probabilityBelow } from "./linearRegression";

describe("fitLinearRegression", () => {
  it("recovers an exact linear relationship with zero noise", () => {
    // y = 3 + 2*x1 - 1*x2, sampled at enough points to satisfy the sample floor.
    const features: number[][] = [];
    const y: number[] = [];
    for (let x1 = 0; x1 < 5; x1++) {
      for (let x2 = 0; x2 < 5; x2++) {
        features.push([x1, x2]);
        y.push(3 + 2 * x1 - 1 * x2);
      }
    }
    const fit = fitLinearRegression(features, y)!;
    expect(fit).not.toBeNull();
    expect(fit.coefficients[0]).toBeCloseTo(3, 6);
    expect(fit.coefficients[1]).toBeCloseTo(2, 6);
    expect(fit.coefficients[2]).toBeCloseTo(-1, 6);
    expect(fit.residualStdDev).toBeCloseTo(0, 6);
  });

  it("refuses to fit with too few samples relative to parameters", () => {
    // 2 features + intercept = 3 params; well under the 4x margin.
    const features = [[1, 2], [3, 4], [5, 6]];
    const y = [1, 2, 3];
    expect(fitLinearRegression(features, y)).toBeNull();
  });

  it("refuses to fit when a feature never varies (singular design matrix)", () => {
    const features = Array.from({ length: 20 }, (_, i) => [i, 7]); // second feature constant
    const y = features.map((f) => f[0] * 2);
    expect(fitLinearRegression(features, y)).toBeNull();
  });

  it("rejects mismatched lengths and empty input", () => {
    expect(fitLinearRegression([], [])).toBeNull();
    expect(fitLinearRegression([[1]], [1, 2])).toBeNull();
  });

  it("reports a non-zero residual spread for noisy data", () => {
    const features: number[][] = [];
    const y: number[] = [];
    let seed = 1;
    const rand = () => {
      // Deterministic PRNG so the test is reproducible.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 30; i++) {
      const x = i;
      features.push([x]);
      y.push(10 + 2 * x + (rand() - 0.5) * 4);
    }
    const fit = fitLinearRegression(features, y)!;
    expect(fit.coefficients[1]).toBeCloseTo(2, 0); // roughly right slope
    expect(fit.residualStdDev).toBeGreaterThan(0);
  });
});

describe("predict", () => {
  it("applies the fitted coefficients to a feature vector", () => {
    const fit = { coefficients: [10, 2, -1], residualStdDev: 0, sampleCount: 20 };
    expect(predict(fit, [3, 4])).toBe(10 + 2 * 3 - 1 * 4);
  });
});

describe("probabilityBelow", () => {
  it("is 0.5 when the prediction exactly equals the target", () => {
    const fit = { coefficients: [0], residualStdDev: 500, sampleCount: 20 };
    expect(probabilityBelow(fit, 10_000, 10_000)).toBeCloseTo(0.5, 6);
  });

  it("is high when predicted is comfortably below target, low when comfortably above", () => {
    const fit = { coefficients: [0], residualStdDev: 200, sampleCount: 20 };
    expect(probabilityBelow(fit, 8_000, 10_000)).toBeGreaterThan(0.9);
    expect(probabilityBelow(fit, 12_000, 10_000)).toBeLessThan(0.1);
  });

  it("falls back to a hard threshold when there's no residual spread", () => {
    const fit = { coefficients: [0], residualStdDev: 0, sampleCount: 20 };
    expect(probabilityBelow(fit, 9_000, 10_000)).toBe(1);
    expect(probabilityBelow(fit, 11_000, 10_000)).toBe(0);
  });
});
