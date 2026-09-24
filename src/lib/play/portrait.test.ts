import { describe, expect, it } from "vitest";
import { fitTransform, portrait, strokeLength } from "./portrait";

const moves = "R U R' U' F D2 L' B".split(" ");
const times = [0, 120, 240, 900, 1000, 1100, 2500, 2600];

describe("Solve Portraits", () => {
  it("draws one stroke per turn, the same every time for the same solve", () => {
    const a = portrait(moves, times, [300, 1050, 2000]);
    expect(a.segs).toHaveLength(moves.length);
    expect(portrait(moves, times, [300, 1050, 2000])).toEqual(a);
    // Each stroke starts where the last one ended.
    for (let i = 1; i < a.segs.length; i++) {
      expect(a.segs[i].x1).toBeCloseTo(a.segs[i - 1].x2);
      expect(a.segs[i].y1).toBeCloseTo(a.segs[i - 1].y2);
    }
  });

  it("gives a different picture for a different solve", () => {
    const other = portrait(["L", ...moves.slice(1)], times);
    expect(other.segs[3].x2).not.toBeCloseTo(portrait(moves, times).segs[3].x2);
  });

  it("walks further after a pause, and inks each phase in turn", () => {
    expect(strokeLength(1200)).toBeGreaterThan(strokeLength(80) * 3);
    const p = portrait(moves, times, [300, 1050, 2000]);
    expect(p.segs.map((s) => s.phase)).toEqual([0, 0, 0, 1, 1, 2, 3, 3]);
    expect(p.segs[3].w).toBeGreaterThan(p.segs[1].w);
  });

  it("fits any portrait inside the canvas", () => {
    const p = portrait(moves, times);
    const { scale, ox, oy } = fitTransform(p.bounds, 400, 300);
    for (const s of p.segs) {
      for (const [x, y] of [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ]) {
        expect(x * scale + ox).toBeGreaterThanOrEqual(-0.01);
        expect(x * scale + ox).toBeLessThanOrEqual(400.01);
        expect(y * scale + oy).toBeGreaterThanOrEqual(-0.01);
        expect(y * scale + oy).toBeLessThanOrEqual(300.01);
      }
    }
  });
});
