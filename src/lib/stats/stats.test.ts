import { describe, expect, it } from "vitest";
import {
  averageOfN,
  computeAchievements,
  computeActivity,
  computeHistogram,
  computeHourOfDay,
  computePBHistory,
  computePhaseSplits,
  computeSessionStats,
  rollingAverages,
} from "./stats";
import type { Solve } from "@/types";

function solve(timeMs: number, penalty: Solve["penalty"] = "none", date = Date.now()): Solve {
  return { id: Math.random().toString(), sessionId: "s", timeMs, penalty, scramble: "", date };
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

describe("computeActivity", () => {
  const day = 24 * 60 * 60 * 1000;

  it("groups solves by local calendar day", () => {
    const now = Date.now();
    const solves = [solve(1000, "none", now), solve(2000, "none", now)];
    const activity = computeActivity(solves);
    expect(activity.days).toHaveLength(1);
    expect(activity.days[0].count).toBe(2);
  });

  it("computes a current streak across consecutive days including today", () => {
    const now = Date.now();
    const solves = [solve(1000, "none", now - 2 * day), solve(1000, "none", now - day), solve(1000, "none", now)];
    const activity = computeActivity(solves);
    expect(activity.currentStreak).toBe(3);
    expect(activity.longestStreak).toBe(3);
  });

  it("resets the current streak when yesterday was skipped", () => {
    const now = Date.now();
    const solves = [solve(1000, "none", now - 5 * day), solve(1000, "none", now - 4 * day)];
    const activity = computeActivity(solves);
    expect(activity.currentStreak).toBe(0);
    expect(activity.longestStreak).toBe(2);
  });
});

describe("computeHistogram", () => {
  it("buckets finite times and excludes DNFs", () => {
    const solves = [solve(1000), solve(2000), solve(3000), solve(1500, "dnf")];
    const buckets = computeHistogram(solves, 3);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(3);
  });

  it("returns an empty array with no finite solves", () => {
    expect(computeHistogram([solve(1000, "dnf")])).toEqual([]);
  });
});

describe("computeHourOfDay", () => {
  it("groups mean time by local hour", () => {
    const d = new Date();
    d.setHours(10, 0, 0, 0);
    const solves = [solve(1000, "none", d.getTime()), solve(3000, "none", d.getTime())];
    const buckets = computeHourOfDay(solves);
    expect(buckets[10].count).toBe(2);
    expect(buckets[10].mean).toBe(2000);
  });
});

describe("computePBHistory", () => {
  it("records only strictly improving singles, in order", () => {
    const solves = [solve(5000), solve(4000), solve(6000), solve(3000)];
    const history = computePBHistory(solves);
    expect(history.map((h) => h.ms)).toEqual([5000, 4000, 3000]);
  });
});

describe("computeAchievements", () => {
  it("is entirely locked with no solves", () => {
    const achievements = computeAchievements([]);
    expect(achievements.every((a) => !a.unlocked)).toBe(true);
  });

  it("unlocks count-based achievements once the threshold is reached", () => {
    const solves = Array.from({ length: 10 }, () => solve(20000));
    const achievements = computeAchievements(solves);
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    expect(byId["first-solve"].unlocked).toBe(true);
    expect(byId["solves-10"].unlocked).toBe(true);
    expect(byId["solves-100"].unlocked).toBe(false);
  });

  it("unlocks speed achievements once a fast-enough single is recorded", () => {
    const solves = [solve(25000), solve(9500)];
    const achievements = computeAchievements(solves);
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    expect(byId["sub-30"].unlocked).toBe(true);
    expect(byId["sub-10"].unlocked).toBe(true);
    expect(byId["sub-15"].unlocked).toBe(true);
  });

  it("does not unlock speed achievements when every solve is DNF", () => {
    const solves = [solve(1000, "dnf"), solve(2000, "dnf")];
    const achievements = computeAchievements(solves);
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    expect(byId["sub-30"].unlocked).toBe(false);
  });

  it("unlocks streak achievements based on the longest streak", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const solves = [solve(1000, "none", now - 2 * day), solve(1000, "none", now - day), solve(1000, "none", now)];
    const achievements = computeAchievements(solves);
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    expect(byId["streak-3"].unlocked).toBe(true);
    expect(byId["streak-7"].unlocked).toBe(false);
  });
});

describe("computePhaseSplits", () => {
  const labels = (count: number) =>
    count === 4 ? ["Cross", "F2L", "OLL", "PLL"] : count === 3 ? ["F2L", "OLL", "PLL"] : ["Solve"];

  const withSplits = (timeMs: number, splits: number[], extra: Partial<Solve> = {}): Solve => ({
    id: Math.random().toString(36),
    sessionId: "s",
    timeMs,
    penalty: "none",
    scramble: "",
    date: 0,
    splits,
    ...extra,
  });

  it("returns null when nothing was phase-timed", () => {
    expect(computePhaseSplits([withSplits(10_000, [])], labels)).toBeNull();
    expect(computePhaseSplits([], labels)).toBeNull();
  });

  it("averages each phase's own duration, not the running total", () => {
    const summary = computePhaseSplits(
      [withSplits(20_000, [2_000, 12_000, 16_000]), withSplits(24_000, [4_000, 14_000, 18_000])],
      labels,
    )!;
    expect(summary.sampleSize).toBe(2);
    expect(summary.phases.map((p) => p.label)).toEqual(["Cross", "F2L", "OLL", "PLL"]);
    expect(summary.phases.map((p) => p.meanMs)).toEqual([3_000, 10_000, 4_000, 5_000]);
    expect(summary.phases[0].bestMs).toBe(2_000);
    // Shares are of the mean total, and account for the whole solve.
    expect(summary.phases.reduce((n, p) => n + p.share, 0)).toBeCloseTo(1, 10);
  });

  it("ignores DNFs, whose later phases measure nothing", () => {
    const summary = computePhaseSplits(
      [
        withSplits(20_000, [2_000, 12_000, 16_000]),
        withSplits(60_000, [30_000, 40_000, 50_000], { penalty: "dnf" }),
      ],
      labels,
    )!;
    expect(summary.sampleSize).toBe(1);
    expect(summary.phases[0].meanMs).toBe(2_000);
  });

  it("keeps phase counts apart rather than averaging across them", () => {
    // Two 3-phase solves and one 4-phase: the larger group wins outright, so
    // "F2L" is never averaged against "Cross".
    const summary = computePhaseSplits(
      [
        withSplits(20_000, [10_000, 15_000]),
        withSplits(24_000, [12_000, 18_000]),
        withSplits(30_000, [3_000, 20_000, 25_000]),
      ],
      labels,
    )!;
    expect(summary.sampleSize).toBe(2);
    expect(summary.phases).toHaveLength(3);
    expect(summary.phases.map((p) => p.label)).toEqual(["F2L", "OLL", "PLL"]);
  });

  it("drops a solve whose marks run backwards", () => {
    const summary = computePhaseSplits(
      [withSplits(20_000, [2_000, 12_000, 16_000]), withSplits(10_000, [2_000, 4_000, 30_000])],
      labels,
    );
    expect(summary!.sampleSize).toBe(1);
  });
});
