import { describe, expect, it } from "vitest";
import { buildConstellation } from "./constellation";
import type { Solve } from "@/types";

function solve(overrides: Partial<Solve> & { date: number; timeMs: number }): Solve {
  return {
    id: `id-${overrides.date}`,
    sessionId: "s1",
    penalty: "none",
    scramble: "R U R' U'",
    ...overrides,
  };
}

describe("buildConstellation", () => {
  it("returns nothing for an empty list", () => {
    expect(buildConstellation([])).toEqual([]);
  });

  it("excludes DNFs entirely", () => {
    const stars = buildConstellation([
      solve({ date: 1, timeMs: 10000 }),
      solve({ date: 2, timeMs: 12000, penalty: "dnf" }),
    ]);
    expect(stars).toHaveLength(1);
  });

  it("excludes event-tagged solves (OH/feet/BLD), matching normalSolves everywhere else", () => {
    const stars = buildConstellation([solve({ date: 1, timeMs: 10000 }), solve({ date: 2, timeMs: 10000, event: "oh" })]);
    expect(stars).toHaveLength(1);
  });

  it("places the fastest solve at x=+1ish and the slowest at x=-1ish in a two-solve set", () => {
    const stars = buildConstellation([solve({ date: 1, timeMs: 8000 }), solve({ date: 2, timeMs: 12000 })]);
    const fast = stars.find((s) => s.finalMs === 8000)!;
    const slow = stars.find((s) => s.finalMs === 12000)!;
    expect(fast.x).toBeGreaterThan(slow.x);
  });

  it("gives every solve x=0 when every time is identical (no speed range to normalize against)", () => {
    const stars = buildConstellation([solve({ date: 1, timeMs: 10000 }), solve({ date: 2, timeMs: 10000 })]);
    for (const s of stars) expect(s.x).toBe(0);
  });

  it("orders z chronologically, oldest at -1, newest at +1", () => {
    const stars = buildConstellation([
      solve({ date: 100, timeMs: 10000 }),
      solve({ date: 200, timeMs: 9000 }),
      solve({ date: 300, timeMs: 11000 }),
    ]);
    expect(stars[0].z).toBeLessThan(stars[1].z);
    expect(stars[1].z).toBeLessThan(stars[2].z);
    expect(stars[0].z).toBeCloseTo(-1);
    expect(stars[stars.length - 1].z).toBeCloseTo(1);
  });

  it("marks isPB true exactly on solves that were the best-so-far at the time, not just the overall best", () => {
    const stars = buildConstellation([
      solve({ date: 1, timeMs: 10000 }), // PB (first solve)
      solve({ date: 2, timeMs: 12000 }), // not a PB — slower than 10000
      solve({ date: 3, timeMs: 8000 }), // PB — faster than the running best of 10000
      solve({ date: 4, timeMs: 9000 }), // not a PB — slower than running best of 8000
    ]);
    expect(stars.map((s) => s.isPB)).toEqual([true, false, true, false]);
  });

  it("gives a solve well above its running mean a positive y, and one well below a negative y", () => {
    const stars = buildConstellation([
      solve({ date: 1, timeMs: 10000 }),
      solve({ date: 2, timeMs: 10000 }),
      solve({ date: 3, timeMs: 10000 }),
      solve({ date: 4, timeMs: 4000 }), // dramatically faster than the 10000 running mean
      solve({ date: 5, timeMs: 20000 }), // dramatically slower
    ]);
    expect(stars[3].y).toBeGreaterThan(0);
    expect(stars[4].y).toBeLessThan(0);
  });

  it("keeps every axis within [-1, 1]", () => {
    const stars = buildConstellation(
      Array.from({ length: 30 }, (_, i) => solve({ date: i, timeMs: 5000 + Math.round(Math.sin(i) * 4000) })),
    );
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(-1);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(-1);
      expect(s.y).toBeLessThanOrEqual(1);
      expect(s.z).toBeGreaterThanOrEqual(-1);
      expect(s.z).toBeLessThanOrEqual(1);
    }
  });
});
