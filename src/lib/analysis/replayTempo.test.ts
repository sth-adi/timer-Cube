import { describe, expect, it } from "vitest";
import { relativeTempoScales } from "./replayTempo";

describe("relativeTempoScales", () => {
  it("gives both sides tempo 1 when they moved at exactly the same pace", () => {
    // 40 moves in 8s vs 40 moves in 8s — identical tps.
    const { a, b } = relativeTempoScales(40, 8000, 40, 8000);
    expect(a).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(1, 5);
  });

  it("gives the faster (higher tps) side a scale above 1 and the slower below 1", () => {
    // A: 40 moves in 8s = 5 tps. B: 40 moves in 16s = 2.5 tps.
    const { a, b } = relativeTempoScales(40, 8000, 40, 16000);
    expect(a).toBeGreaterThan(1);
    expect(b).toBeLessThan(1);
    expect(a).toBeGreaterThan(b);
  });

  it("is symmetric — swapping sides swaps the result", () => {
    const forward = relativeTempoScales(40, 8000, 50, 20000);
    const swapped = relativeTempoScales(50, 20000, 40, 8000);
    expect(forward.a).toBeCloseTo(swapped.b, 5);
    expect(forward.b).toBeCloseTo(swapped.a, 5);
  });

  it("clamps extreme ratios so playback never goes absurdly fast or slow", () => {
    // A is 100x the tps of B.
    const { a, b } = relativeTempoScales(100, 1000, 1, 10000);
    expect(a).toBeLessThanOrEqual(3);
    expect(b).toBeGreaterThanOrEqual(0.4);
  });

  it("falls back to 1/1 for degenerate input (no moves or non-positive time)", () => {
    expect(relativeTempoScales(0, 8000, 40, 8000)).toEqual({ a: 1, b: 1 });
    expect(relativeTempoScales(40, 0, 40, 8000)).toEqual({ a: 1, b: 1 });
  });
});
