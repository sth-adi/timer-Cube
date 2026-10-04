import { describe, expect, it } from "vitest";
import { averageTps, computeTpsBuckets, formatLiveTps, peakTps, rollingTps } from "./tps";

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

/** A steady stream: one move every `1000 / tps` ms for `seconds`, starting at 0. */
const steady = (tps: number, seconds: number) => Array.from({ length: Math.floor(tps * seconds) + 1 }, (_, i) => (i * 1000) / tps);

describe("rollingTps", () => {
  it("is zero with no moves", () => {
    expect(rollingTps([], 3000)).toBe(0);
  });

  it("reads a steady stream as that rate once the window has filled", () => {
    for (const tps of [2, 4, 6]) {
      const ts = steady(tps, 8);
      // Sample between moves too, not just on them.
      for (let at = 4000; at <= 8000; at += 37) expect(Math.abs(rollingTps(ts, at) - tps)).toBeLessThan(tps * 0.12);
    }
  });

  it("tells a fast hand from a slow one", () => {
    expect(rollingTps(steady(6, 6), 6000)).toBeGreaterThan(rollingTps(steady(3, 6), 6000) * 1.7);
  });

  it("doesn't step when a move lands or ages out — frame to frame it only drifts", () => {
    const ts = steady(4, 10);
    let prev = rollingTps(ts, 3000);
    let worst = 0;
    for (let at = 3016; at <= 9000; at += 16) {
      const v = rollingTps(ts, at);
      worst = Math.max(worst, Math.abs(v - prev));
      prev = v;
    }
    // The old 1s integer window jumped by a whole 1.0 at every move.
    expect(worst).toBeLessThan(0.1);
  });

  it("is continuous at the instant a move arrives", () => {
    const before = rollingTps([0, 250, 500], 749.9);
    const after = rollingTps([0, 250, 500, 750], 750);
    expect(Math.abs(after - before)).toBeLessThan(0.05);
  });

  it("decays smoothly to zero once turning stops", () => {
    const ts = steady(4, 5);
    // The last move's bump still fills in for a few hundred ms after it lands; from there it only falls.
    let prev = rollingTps(ts, 5500);
    for (let at = 5600; at <= 9000; at += 100) {
      const v = rollingTps(ts, at);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    expect(prev).toBeLessThan(0.05);
  });

  it("ignores moves older than the window and moves not yet made", () => {
    expect(rollingTps([0, 100, 200], 20000)).toBe(0);
    expect(rollingTps([5000, 5200], 4000)).toBe(0);
  });

  it("ramps up from the first move instead of spiking or reading low forever", () => {
    const ts = steady(4, 6);
    const early = rollingTps(ts, 300);
    // Two moves in: below the true rate (the bumps are still rising), not a spike above it.
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(4);
    expect(rollingTps(ts, 2500)).toBeGreaterThan(early);
    expect(rollingTps(ts, 2500)).toBeLessThan(4.5);
  });

  it("slides with the clock rather than sitting at bucket boundaries", () => {
    // A burst reads the same wherever it falls in the solve, and fades as the clock moves on.
    const burst = steady(5, 2);
    const late = burst.map((t) => t + 7000);
    expect(rollingTps(late, 9000)).toBeCloseTo(rollingTps(burst, 2000), 6);
    expect(rollingTps(late, 9000)).toBeGreaterThan(rollingTps(late, 10500));
  });
});

describe("formatLiveTps", () => {
  it("is null at rest so the caller can show a placeholder", () => {
    expect(formatLiveTps(null)).toBeNull();
    expect(formatLiveTps(0)).toBeNull();
    expect(formatLiveTps(0.04)).toBeNull();
    expect(formatLiveTps(Number.NaN)).toBeNull();
  });

  it("shows one decimal otherwise", () => {
    expect(formatLiveTps(0.05)).toBe("0.1");
    expect(formatLiveTps(3.96)).toBe("4.0");
    expect(formatLiveTps(12.34)).toBe("12.3");
  });
});
