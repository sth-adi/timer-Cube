import { describe, expect, it } from "vitest";
import { correctBurstTimestamp } from "./burstTimestamp";

describe("correctBurstTimestamp", () => {
  it("trusts the host timestamp for a standalone first move", () => {
    const s = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500 });
    expect(s).toEqual({ timestamp: 1000, cubeTimestamp: 500, correctedTimestamp: 1000 });
  });

  it("trusts the host timestamp when it genuinely advances (no burst)", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1300, cubeTimestamp: 800 });
    expect(s2.correctedTimestamp).toBe(1300);
  });

  it("spreads out moves that share one host timestamp using cubeTimestamp deltas", () => {
    // Three turns land in one BLE notification — same host timestamp, but
    // the cube's own clock shows they were really 40ms and 35ms apart.
    const s1 = correctBurstTimestamp(null, { timestamp: 2000, cubeTimestamp: 1000 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 2000, cubeTimestamp: 1040 });
    const s3 = correctBurstTimestamp(s2, { timestamp: 2000, cubeTimestamp: 1075 });
    expect(s1.correctedTimestamp).toBe(2000);
    expect(s2.correctedTimestamp).toBe(2040);
    expect(s3.correctedTimestamp).toBe(2075);
  });

  it("falls back to the host timestamp when cubeTimestamp is unavailable (GiiKER/GoCube)", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: null });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1000, cubeTimestamp: null });
    expect(s2.correctedTimestamp).toBe(1000);
  });

  it("falls back to the host timestamp when only one side has a cube clock", () => {
    const s1 = correctBurstTimestamp(null, { timestamp: 1000 });
    const s2 = correctBurstTimestamp(s1, { timestamp: 1000, cubeTimestamp: 40 });
    expect(s2.correctedTimestamp).toBe(1000);
  });

  it("keeps correcting across a run of repeats, not just the first pair", () => {
    let s: ReturnType<typeof correctBurstTimestamp> | null = null;
    const deltas = [0, 10, 12, 9, 11];
    let cube = 0;
    for (const d of deltas) {
      cube += d;
      s = correctBurstTimestamp(s, { timestamp: 5000, cubeTimestamp: cube });
    }
    expect(s!.correctedTimestamp).toBe(5000 + (10 + 12 + 9 + 11));
  });

  describe("anchoring back from the notification's arrival", () => {
    it("never lets a burst land later than the notification that carried it", () => {
      // A lone turn, then a backlog of three delivered together at host time 1200.
      let s = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500, arrivalMs: 1000 });
      const times: number[] = [];
      for (const cube of [650, 700, 760]) {
        s = correctBurstTimestamp(s, { timestamp: 1200, cubeTimestamp: cube, arrivalMs: 1200 });
        times.push(s.correctedTimestamp);
      }
      // The head is placed by the cube-clock gap from the turn before it, not at the arrival.
      expect(times[0]).toBe(1150);
      expect(times[1]).toBe(1200);
      expect(times[2]).toBe(1200);
      expect(Math.max(...times)).toBeLessThanOrEqual(1200);
    });

    it("keeps the burst's spacing without pushing the last move past the arrival", () => {
      let s = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 500, arrivalMs: 1000 });
      const times: number[] = [];
      for (const cube of [560, 600, 640]) {
        s = correctBurstTimestamp(s, { timestamp: 1200, cubeTimestamp: cube, arrivalMs: 1200 });
        times.push(s.correctedTimestamp);
      }
      expect(times).toEqual([1060, 1100, 1140]);
    });

    it("does not inflate the solve's final time when a burst ends it", () => {
      // The head has no earlier turn to be placed from: forward anchoring would put its follower at 5040, past the arrival.
      const head = correctBurstTimestamp(null, { timestamp: 5000, cubeTimestamp: 100, arrivalMs: 5000 });
      const last = correctBurstTimestamp(head, { timestamp: 5000, cubeTimestamp: 140, arrivalMs: 5000 });
      expect(last.correctedTimestamp).toBe(5000);
    });

    it("never goes backwards, even when the host clock lags what the cube clock implied", () => {
      // Without a ceiling the repeat pair runs forward to 1080; the next notification's host stamp (1050) is behind that.
      const pair = correctBurstTimestamp(correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 0 }), { timestamp: 1000, cubeTimestamp: 80 });
      expect(pair.correctedTimestamp).toBe(1080);
      const next = correctBurstTimestamp(pair, { timestamp: 1050, cubeTimestamp: 120 });
      expect(next.correctedTimestamp).toBe(1080);
    });

    it("falls back to the host clock when the cube's counter restarts", () => {
      const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 90_000, arrivalMs: 1000 });
      const s2 = correctBurstTimestamp(s1, { timestamp: 1300, cubeTimestamp: 40, arrivalMs: 1300 });
      expect(s2.correctedTimestamp).toBe(1300);
    });

    it("trusts the host clock after a long pause or when the two clocks disagree", () => {
      const s1 = correctBurstTimestamp(null, { timestamp: 1000, cubeTimestamp: 0, arrivalMs: 1000 });
      // 5s pause: the cube gap is long, so the arrival stands.
      expect(correctBurstTimestamp(s1, { timestamp: 6000, cubeTimestamp: 5000, arrivalMs: 6000 }).correctedTimestamp).toBe(6000);
      // The cube clock says 200ms passed but the host saw 2s: don't believe the cube.
      expect(correctBurstTimestamp(s1, { timestamp: 3000, cubeTimestamp: 200, arrivalMs: 3000 }).correctedTimestamp).toBe(3000);
    });

    it("leaves a plain slow solve's host timestamps alone", () => {
      let s: ReturnType<typeof correctBurstTimestamp> | null = null;
      const out: number[] = [];
      [0, 400, 800, 1200].forEach((t, i) => {
        s = correctBurstTimestamp(s, { timestamp: 1000 + t, cubeTimestamp: i * 400, arrivalMs: 1000 + t });
        out.push(s.correctedTimestamp);
      });
      expect(out).toEqual([1000, 1400, 1800, 2200]);
    });
  });
});
