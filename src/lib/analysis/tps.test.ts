import { describe, expect, it } from "vitest";
import { averageTps, computeTpsBuckets, peakTps } from "./tps";

describe("computeTpsBuckets", () => {
  it("returns nothing for an empty stream", () => {
    expect(computeTpsBuckets([])).toEqual([]);
  });

  it("buckets moves into fixed windows and counts them", () => {
    // 3 moves in [0,1000), 1 move in [1000,2000)
    const buckets = computeTpsBuckets([0, 300, 900, 1500], 1000);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ startMs: 0, moveCount: 3, tps: 3 });
    expect(buckets[1]).toEqual({ startMs: 1000, moveCount: 1, tps: 1 });
  });

  it("puts a move exactly at the stream's end in the final bucket, not a stray extra one", () => {
    const buckets = computeTpsBuckets([0, 2000], 1000);
    const totalCounted = buckets.reduce((n, b) => n + b.moveCount, 0);
    expect(totalCounted).toBe(2);
  });

  it("handles every move landing in the same instant", () => {
    const buckets = computeTpsBuckets([500, 500, 500], 1000);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].moveCount).toBe(3);
  });
});

describe("averageTps", () => {
  it("is null with fewer than two moves", () => {
    expect(averageTps([])).toBeNull();
    expect(averageTps([100])).toBeNull();
  });

  it("computes moves-per-second over the span between first and last move", () => {
    // 5 moves spanning 4 seconds -> 4 intervals -> 1 move/sec
    expect(averageTps([0, 1000, 2000, 3000, 4000])).toBeCloseTo(1, 5);
  });

  it("is null when the stream has zero duration", () => {
    expect(averageTps([500, 500])).toBeNull();
  });
});

describe("peakTps", () => {
  it("is zero for no buckets", () => {
    expect(peakTps([])).toBe(0);
  });

  it("finds the fastest bucket", () => {
    const buckets = computeTpsBuckets([0, 100, 200, 300, 5000], 1000);
    expect(peakTps(buckets)).toBe(4);
  });
});
