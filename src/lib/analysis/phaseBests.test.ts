import { describe, expect, it } from "vitest";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { MIN_PHASE_SAMPLES, buildPhaseBests, deltaToBest, findGolds } from "./phaseBests";

const m = (phases: [number, number, number, number], extra: Partial<SolveMetrics> = {}): SolveMetrics =>
  ({ phases, ollSkip: false, pllSkip: false, ...extra }) as SolveMetrics;

describe("buildPhaseBests", () => {
  it("takes the fastest of each phase, once there are enough attempts", () => {
    const many = Array.from({ length: MIN_PHASE_SAMPLES }, (_, i) => m([2000 + i * 100, 5000 + i * 100, 1500 + i * 100, 1800 + i * 100]));
    const r = buildPhaseBests(many);
    expect(r.bests).toEqual([2000, 5000, 1500, 1800]);
    expect(r.sumOfBestMs).toBe(10300);
  });

  it("stays null until a phase has enough real attempts", () => {
    const r = buildPhaseBests([m([2000, 5000, 1500, 1800])]);
    expect(r.bests).toEqual([null, null, null, null]);
    expect(r.sumOfBestMs).toBeNull();
  });

  it("doesn't let skipped OLLs/PLLs set an impossible best", () => {
    const solves = Array.from({ length: 6 }, (_, i) => m([2000, 5000, 1500 + i * 10, 1800]));
    solves.push(m([2000, 5000, 1, 1800], { ollSkip: true }), m([2000, 5000, 1500, 1], { pllSkip: true }));
    const r = buildPhaseBests(solves);
    expect(r.bests[2]).toBe(1500);
    expect(r.bests[3]).toBe(1800);
  });

  it("ignores zero and non-finite phase times", () => {
    const solves = [...Array.from({ length: 5 }, () => m([2000, 5000, 1500, 1800])), m([0, NaN, 0, 0])];
    expect(buildPhaseBests(solves).bests).toEqual([2000, 5000, 1500, 1800]);
  });
});

describe("findGolds", () => {
  const bests = [2000, 5000, 1500, 1800];
  it("flags only phases that beat the best, by how much", () => {
    expect(findGolds([1900, 5200, 1400, 1800], bests)).toEqual([
      { phase: 0, ms: 1900, underBy: 100 },
      { phase: 2, ms: 1400, underBy: 100 },
    ]);
  });
  it("a tie is not a gold", () => {
    expect(findGolds([2000, 5000, 1500, 1800], bests)).toEqual([]);
  });
  it("skips and unfinished or unknown phases never count", () => {
    expect(findGolds([null, 4000, 10, 5], bests, [false, false, true, true])).toEqual([{ phase: 1, ms: 4000, underBy: 1000 }]);
    expect(findGolds([1000, 1000, 1000, 1000], [null, null, null, null])).toEqual([]);
  });
});

describe("deltaToBest", () => {
  it("is negative under the best, positive over it, null without a fair comparison", () => {
    expect(deltaToBest(1900, 2000)).toBe(-100);
    expect(deltaToBest(2300, 2000)).toBe(300);
    expect(deltaToBest(null, 2000)).toBeNull();
    expect(deltaToBest(1900, null)).toBeNull();
    expect(deltaToBest(5, 2000, true)).toBeNull();
  });
});
