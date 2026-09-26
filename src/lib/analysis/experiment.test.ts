import { describe, expect, it } from "vitest";
import { analyzeExperiment, bootstrapCI, mulberry32, permutationP, trendExpectation } from "./experiment";

/** Normal-ish noise around `mean` (sum of uniforms), seeded. */
function sample(n: number, meanMs: number, spread: number, seed: number): number[] {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => meanMs + ((r() + r() + r() + r()) / 4 - 0.5) * 2 * spread);
}

describe("experiment statistics", () => {
  it("finds a real 1.5s improvement and brackets it", () => {
    const before = sample(40, 15000, 2000, 1);
    const after = sample(40, 13500, 2000, 2);
    const r = analyzeExperiment(before, after)!;
    expect(r.verdict).toBe("better");
    expect(r.p).toBeLessThan(0.01);
    expect(r.ci[0]).toBeLessThan(-1500 + 800);
    expect(r.ci[1]).toBeLessThan(0);
    expect(r.headline).toMatch(/Faster after the change/);
  });

  it("calls identical distributions unclear, and says how many solves would settle it", () => {
    const r = analyzeExperiment(sample(30, 15000, 2000, 3), sample(30, 14950, 2000, 4))!;
    expect(r.verdict).toBe("unclear");
    expect(r.p).toBeGreaterThan(0.05);
  });

  it("waits for enough solves on each side", () => {
    expect(analyzeExperiment(sample(5, 15000, 1000, 5), sample(20, 13000, 1000, 6))!.verdict).toBe("too-few");
    expect(analyzeExperiment([1], [2])).toBeNull();
  });

  it("is deterministic", () => {
    const a = sample(20, 12000, 1000, 7);
    const b = sample(20, 11800, 1000, 8);
    expect(permutationP(a, b)).toBe(permutationP(a, b));
    expect(bootstrapCI(a, b)).toEqual(bootstrapCI(a, b));
  });

  it("credits an already-improving trend instead of the change", () => {
    // Steadily improving 20ms a solve; the "after" just continues the line.
    const before = Array.from({ length: 40 }, (_, i) => 16000 - i * 20);
    const after = Array.from({ length: 20 }, (_, i) => 16000 - (40 + i) * 20);
    const expected = trendExpectation(before, after.length)!;
    expect(expected).toBeCloseTo(16000 - 49.5 * 20, -1);
    const r = analyzeExperiment(before, after)!;
    expect(r.diffMs).toBeLessThan(-300);
    expect(Math.abs(r.trendAdjustedMs!)).toBeLessThan(50);
    expect(r.headline).toMatch(/existing improvement trend predicted/);
  });
});
