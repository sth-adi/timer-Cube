import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { computeXp, levelInfo, weekStart, weeklyQuests, xpForLevel } from "./quests";

const NOW = new Date(2026, 8, 24, 18).getTime(); // a Thursday
const DAY = 864e5;
let n = 0;
const solve = (date: number, timeMs: number, extra: Partial<Solve> = {}): Solve => ({ id: `q${n++}`, sessionId: "s", timeMs, penalty: "none", scramble: "", date, ...extra });

describe("levels", () => {
  it("grows each level a little longer than the last", () => {
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 100, 300, 600]);
    expect(levelInfo(0)).toMatchObject({ level: 1, title: "Beginner", into: 0, span: 100 });
    expect(levelInfo(650)).toMatchObject({ level: 4, title: "Cuber", into: 50, span: 400 });
  });
});

describe("XP", () => {
  it("counts solves, PBs after the first, and every other source", () => {
    const solves = [solve(1, 20000), solve(2, 18000), solve(3, 19000), solve(4, 17000, { reconstruction: "R", moveTimestamps: [1] })];
    const xp = computeXp({ solves, activeDays: 2, achievementsUnlocked: 1, gymReps: [{ ok: true }, { ok: false }], compRounds: 1, claimedQuestXp: 150 });
    const part = (l: string) => xp.parts.find((p) => p.label === l)?.xp;
    expect(part("Solves")).toBe(40);
    expect(part("Smart-cube bonus")).toBe(5);
    expect(part("Single PBs")).toBe(200);
    expect(part("Gym reps")).toBe(8);
    expect(xp.total).toBe(40 + 5 + 200 + 40 + 150 + 8 + 60 + 150);
  });
});

describe("weekly quests", () => {
  const start = weekStart(NOW);
  it("starts weeks on Monday", () => {
    expect(new Date(start).getDay()).toBe(1);
  });

  it("sizes the volume quest from your usual week and measures this week", () => {
    const past = Array.from({ length: 160 }, (_, i) => solve(start - 1 - i * (28 * DAY) / 160, 15000));
    const week = Array.from({ length: 12 }, (_, i) => solve(start + i * 3600e3, 14000));
    const q = weeklyQuests({ now: NOW, solves: [...past, ...week], metrics: [], gymReps: [], compRoundDates: [], topFinding: null });
    expect(q[0]).toMatchObject({ kind: "volume", target: 50, progress: 12, done: false });
  });

  it("aims the skill quest at the Coach's top finding", () => {
    const reps = Array.from({ length: 35 }, (_, i) => ({ ok: i % 7 !== 0, at: start + i * 1000 }));
    const q = weeklyQuests({ now: NOW, solves: [], metrics: [], gymReps: reps, compRoundDates: [], topFinding: "drill-algs" });
    expect(q[1]).toMatchObject({ id: expect.stringContaining(":gym"), progress: 30, done: true });

    const metrics = [
      ...Array.from({ length: 10 }, (_, i) => ({ date: start - DAY - i, f2lPauseMs: 3000, phases: [2000, 6000, 2000, 2000] })),
      ...Array.from({ length: 4 }, (_, i) => ({ date: start + i, f2lPauseMs: 2000, phases: [2000, 6000, 2000, 2000] })),
    ] as unknown as SolveMetrics[];
    const q2 = weeklyQuests({ now: NOW, solves: [], metrics, gymReps: [], compRoundDates: [], topFinding: "f2l-pauses" });
    expect(q2[1].title).toMatch(/under 2\.4s of F2L pausing/);
    expect(q2[1].progress).toBe(4);
  });

  it("sets the stretch quest against the best Ao5 before this week", () => {
    const past = [10000, 11000, 12000, 13000, 14000].map((t, i) => solve(start - DAY - i, t)); // best Ao5 12.00
    const week = [10000, 10000, 11000, 11000, 11000].map((t, i) => solve(start + i, t));
    const q = weeklyQuests({ now: NOW, solves: [...past, ...week], metrics: [], gymReps: [], compRoundDates: [], topFinding: null });
    expect(q[2]).toMatchObject({ kind: "stretch", done: true });
    expect(q[2].title).toMatch(/12\.00/);
  });
});
