import { describe, expect, it } from "vitest";
import {
  achievementSolves,
  averageOfN,
  averageTrend,
  computeAchievements,
  computeActivity,
  computeHistogram,
  computeHourOfDay,
  computePBHistory,
  computePhaseSplits,
  normalSolves,
  solvesForEvent,
  eventTagsPresent,
  computeSessionStats,
  rollingAverageResults,
  rollingAverages,
  trimCount,
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

  it("trims 5% from each end, rounded up", () => {
    expect([3, 5, 12, 25, 50, 100, 1000].map(trimCount)).toEqual([0, 1, 1, 2, 3, 5, 50]);
  });

  it("ao12 trims 1 each side", () => {
    // 1..12 s -> drop 1 and 12 -> mean(2..11) = 6.5 s
    const times = Array.from({ length: 12 }, (_, i) => (i + 1) * 1000);
    expect(averageOfN(times).value).toBe(6500);
  });

  it("ao50 trims 3 each side", () => {
    // 1..50 s with three huge outliers each end: only the middle 44 count
    const times = Array.from({ length: 50 }, (_, i) => (i + 1) * 1000);
    times[0] = 1;
    times[1] = 2;
    times[2] = 3;
    times[47] = 900_000;
    times[48] = 900_000;
    times[49] = 900_000;
    // middle = 4..47 s -> mean 25.5 s
    expect(averageOfN(times).value).toBe(25_500);
  });

  it("ao100 trims 5 each side", () => {
    const times = Array.from({ length: 100 }, (_, i) => (i + 1) * 1000);
    // middle = 6..95 s -> mean 50.5 s
    expect(averageOfN(times).value).toBe(50_500);
  });

  it("an average survives as many DNFs as it trims, and no more", () => {
    const base = Array.from({ length: 50 }, (_, i) => (i + 1) * 1000);
    const three = [...base.slice(0, 47), Infinity, Infinity, Infinity];
    expect(averageOfN(three).isDnf).toBe(false);
    // 1..47 s, drop 1-3 s and the three DNFs -> mean(4..47) = 25.5 s
    expect(averageOfN(three).value).toBe(25_500);
    const four = [...base.slice(0, 46), Infinity, Infinity, Infinity, Infinity];
    expect(averageOfN(four)).toEqual({ value: null, isDnf: true });
    const ao100 = Array.from({ length: 100 }, (_, i) => (i < 5 ? Infinity : 1000));
    expect(averageOfN(ao100).value).toBe(1000);
    ao100[5] = Infinity;
    expect(averageOfN(ao100).isDnf).toBe(true);
  });

  it("ao12 is DNF with two DNFs", () => {
    const times = [...Array.from({ length: 10 }, () => 1000), Infinity, Infinity];
    expect(averageOfN(times).isDnf).toBe(true);
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

describe("DNF averages", () => {
  const seq = (...times: (number | "dnf")[]) => times.map((t) => (t === "dnf" ? solve(1000, "dnf") : solve(t)));

  it("flags a DNF ao5 instead of leaving it indistinguishable from 'not enough solves'", () => {
    const stats = computeSessionStats(seq(1000, 2000, 3000, "dnf", "dnf"));
    expect(stats.ao5).toBeNull();
    expect(stats.ao5Dnf).toBe(true);
    expect(stats.ao12).toBeNull();
    expect(stats.ao12Dnf).toBe(false);
  });

  it("does not flag an average that is merely missing solves", () => {
    const stats = computeSessionStats(seq(1000, "dnf", "dnf"));
    expect(stats.ao5).toBeNull();
    expect(stats.ao5Dnf).toBe(false);
  });

  it("keeps a trimmed single DNF as a normal ao5 value", () => {
    const stats = computeSessionStats(seq(1000, 2000, 3000, 4000, "dnf"));
    expect(stats.ao5).toBe(3000);
    expect(stats.ao5Dnf).toBe(false);
  });

  it("ao12 DNF needs two DNFs (trim is 1), ao100 needs six (trim is 5)", () => {
    const ok12 = computeSessionStats(seq(...Array.from({ length: 11 }, () => 1000), "dnf"));
    expect(ok12.ao12Dnf).toBe(false);
    expect(ok12.ao12).toBe(1000);
    const dnf12 = computeSessionStats(seq(...Array.from({ length: 10 }, () => 1000), "dnf", "dnf"));
    expect(dnf12.ao12Dnf).toBe(true);
    expect(dnf12.ao12).toBeNull();

    const ok100 = computeSessionStats(seq(...Array.from({ length: 95 }, () => 1000), ...Array.from({ length: 5 }, () => "dnf" as const)));
    expect(ok100.ao100Dnf).toBe(false);
    const dnf100 = computeSessionStats(seq(...Array.from({ length: 94 }, () => 1000), ...Array.from({ length: 6 }, () => "dnf" as const)));
    expect(dnf100.ao100Dnf).toBe(true);
    expect(dnf100.ao100).toBeNull();
  });

  it("an old DNF window does not make the best ao5 a DNF while a good window exists", () => {
    const stats = computeSessionStats(seq("dnf", "dnf", 1000, 2000, 3000, 4000, 5000));
    expect(stats.bestAo5).toBe(3000);
    expect(stats.bestAo5Dnf).toBe(false);
  });

  it("flags best ao5 as DNF only when every window is a DNF", () => {
    const stats = computeSessionStats(seq(1000, 2000, 3000, "dnf", "dnf", "dnf"));
    expect(stats.bestAo5).toBeNull();
    expect(stats.bestAo5Dnf).toBe(true);
    expect(computeSessionStats(seq(1000, 2000)).bestAo5Dnf).toBe(false);
  });

  it("rollingAverageResults keeps DNF windows distinct from unfilled ones", () => {
    const results = rollingAverageResults(seq(1000, 2000, 3000, 4000, 5000, "dnf", "dnf"), 5);
    expect(results.slice(0, 4)).toEqual([null, null, null, null]);
    expect(results[4]).toEqual({ value: 3000, isDnf: false });
    expect(results[5]).toEqual({ value: 4000, isDnf: false });
    expect(results[6]).toEqual({ value: null, isDnf: true });
    // The number-only view still reports null for both.
    expect(rollingAverages(seq(1000, 2000, 3000, 4000, 5000, "dnf", "dnf"), 5)[6]).toBeNull();
  });
});

describe("averageTrend", () => {
  const seq = (...times: (number | "dnf")[]) => times.map((t) => (t === "dnf" ? solve(1000, "dnf") : solve(t)));

  it("reports the change between the last two windows", () => {
    const trend = averageTrend(seq(1000, 2000, 3000, 4000, 5000, 9000), 5);
    // [1,2,3,4,5] -> 3000; [2,3,4,5,9] -> mean(3,4,5) = 4000
    expect(trend.trail).toEqual([3000, 4000]);
    expect(trend.change).toEqual({ kind: "delta", ms: 1000 });
  });

  it("has no change with a single window", () => {
    expect(averageTrend(seq(1000, 2000, 3000, 4000, 5000), 5).change).toBeNull();
    expect(averageTrend(seq(1000, 2000), 5)).toEqual({ trail: [], change: null });
  });

  it("marks a DNF window as a gap and says so when the newest one is a DNF", () => {
    const trend = averageTrend(seq(1000, 2000, 3000, 4000, 5000, "dnf", "dnf"), 5);
    expect(trend.trail).toEqual([3000, 4000, null]);
    expect(trend.change).toEqual({ kind: "dnf" });
  });

  it("never compares a recovered average against a DNF one", () => {
    // Windows: [1,2,3,d,d] DNF, [2,3,d,d,4] DNF, [3,d,d,4,5] DNF, [d,d,4,5,6] DNF, [d,4,5,6,7] = 6000.
    const trend = averageTrend(seq(1000, 2000, 3000, "dnf", "dnf", 4000, 5000, 6000, 7000), 5);
    expect(trend.trail.slice(-2)).toEqual([null, 6000]);
    expect(trend.change).toEqual({ kind: "after-dnf" });
  });

  it("limits the trail to the most recent windows", () => {
    const trend = averageTrend(seq(...Array.from({ length: 40 }, (_, i) => 1000 + i)), 5, 10);
    expect(trend.trail).toHaveLength(10);
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

describe("achievementSolves", () => {
  const sessions = [
    { id: "s333", event: "333" as const },
    { id: "s222", event: "222" as const },
    { id: "s444", event: "444" as const },
  ];
  const inSession = (sessionId: string, timeMs: number, extra: Partial<Solve> = {}): Solve => ({ ...solve(timeMs), sessionId, ...extra });

  it("keeps ordinary solves from every 3x3 session, drops other puzzles, tagged practice and orphans", () => {
    const mine = [inSession("s333", 12000), inSession("s333", 11000)];
    const all = [...mine, inSession("s222", 2000), inSession("s444", 40000), inSession("gone", 1000), inSession("s333", 9000, { event: "oh" })];
    expect(achievementSolves(all, sessions)).toEqual(mine);
    expect(achievementSolves(all, [...sessions, { id: "gone", event: "333" }]).map((s) => s.timeMs)).toEqual([12000, 11000, 1000]);
  });

  it("keeps a 2x2 time from unlocking Sub-10", () => {
    const all = [inSession("s333", 14000), inSession("s222", 2000)];
    const byId = (solves: Solve[]) => Object.fromEntries(computeAchievements(solves).map((a) => [a.id, a]));
    expect(byId(all)["sub-10"].unlocked).toBe(true);
    expect(byId(achievementSolves(all, sessions))["sub-10"].unlocked).toBe(false);
    expect(byId(achievementSolves(all, sessions))["sub-15"].unlocked).toBe(true);
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

describe("event-tagged solve filtering", () => {
  const base = (overrides: Partial<Solve>): Solve => ({
    id: Math.random().toString(36),
    sessionId: "s",
    timeMs: 10_000,
    penalty: "none",
    scramble: "",
    date: 0,
    ...overrides,
  });

  it("excludes event-tagged solves from normalSolves", () => {
    const solves = [base({}), base({ event: "oh" }), base({ event: "bld" })];
    expect(normalSolves(solves)).toHaveLength(1);
    expect(normalSolves(solves)[0].event).toBeUndefined();
  });

  it("solvesForEvent returns only that tag", () => {
    const solves = [base({}), base({ event: "oh" }), base({ event: "oh" }), base({ event: "feet" })];
    expect(solvesForEvent(solves, "oh")).toHaveLength(2);
    expect(solvesForEvent(solves, "feet")).toHaveLength(1);
    expect(solvesForEvent(solves, "bld")).toHaveLength(0);
  });

  it("eventTagsPresent lists only tags that actually occur, in stable order", () => {
    const solves = [base({ event: "bld" }), base({ event: "oh" }), base({})];
    expect(eventTagsPresent(solves)).toEqual(["oh", "bld"]);
    expect(eventTagsPresent([base({})])).toEqual([]);
  });
});
