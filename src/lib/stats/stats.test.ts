import { describe, expect, it } from "vitest";
import { averageOfN, computeSessionStats, rollingAverages } from "./stats";
import type { Solve } from "@/types";

function solve(timeMs: number, penalty: Solve["penalty"] = "none"): Solve {
  return { id: Math.random().toString(), sessionId: "s", timeMs, penalty, scramble: "", date: Date.now() };
}

describe("averageOfN", () => {
  it("plain means for n<5", () => {
    expect(averageOfN([1000, 2000, 3000]).value).toBe(2000);
  });

  it("trims best+worst for n>=5", () => {
    // sorted: 1,2,3,4,5 -> trim 1 and 5 -> mean(2,3,4)=3
    const r = averageOfN([5000, 1000, 3000, 4000, 2000]);
    expect(r.value).toBe(3000);
    expect(r.isDnf).toBe(false);
  });

  it("is DNF when 2+ DNFs in a 5-window", () => {
    const r = averageOfN([1000, 2000, Infinity, Infinity, 3000]);
    expect(r.isDnf).toBe(true);
    expect(r.value).toBeNull();
  });

  it("tolerates exactly 1 DNF in a 5-window (it gets trimmed as the worst)", () => {
    const r = averageOfN([1000, 2000, 3000, 4000, Infinity]);
    expect(r.isDnf).toBe(false);
    expect(r.value).toBe((2000 + 3000 + 4000) / 3);
  });

  it("any single DNF makes an n<5 average DNF", () => {
    const r = averageOfN([1000, Infinity]);
    expect(r.isDnf).toBe(true);
  });
});

describe("computeSessionStats", () => {
  it("computes best/worst/mean/ao5 correctly", () => {
    const times = [10000, 11000, 9000, 12000, 8000];
    const solves = times.map((t) => solve(t));
    const stats = computeSessionStats(solves);
    expect(stats.best).toBe(8000);
    expect(stats.worst).toBe(12000);
    expect(stats.mean).toBe(10000);
    // sorted 8,9,10,11,12 -> trim 8,12 -> mean(9,10,11)=10000
    expect(stats.ao5).toBe(10000);
  });

  it("applies +2 penalty and excludes DNF from best/worst/mean", () => {
    const solves = [solve(10000), solve(9000, "plus2"), solve(8000, "dnf")];
    const stats = computeSessionStats(solves);
    expect(stats.dnfCount).toBe(1);
    expect(stats.solveCount).toBe(2);
    expect(stats.best).toBe(10000); // 9000+2000 penalty = 11000, so 10000 is best
    expect(stats.worst).toBe(11000);
  });

  it("rollingAverages produces nulls before the window fills, then values", () => {
    const solves = Array.from({ length: 6 }, (_, i) => solve(1000 * (i + 1)));
    const rolling = rollingAverages(solves, 5);
    expect(rolling.slice(0, 4)).toEqual([null, null, null, null]);
    expect(rolling[4]).not.toBeNull();
    expect(rolling[5]).not.toBeNull();
  });
});
