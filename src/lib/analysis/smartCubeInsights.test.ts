import { describe, expect, it } from "vitest";
import {
  computeCoachTip,
  computeEfficiencyPoints,
  computeFaceSpeedFingerprint,
  computeLookaheadScore,
} from "./smartCubeInsights";
import type { Solve } from "@/types";

function makeSolve(overrides: Partial<Solve>): Solve {
  return {
    id: "s1",
    sessionId: "sess1",
    timeMs: 10000,
    penalty: "none",
    scramble: "R U R' U'",
    date: 1,
    ...overrides,
  };
}

describe("computeFaceSpeedFingerprint", () => {
  it("ignores solves without both reconstruction and moveTimestamps", () => {
    expect(computeFaceSpeedFingerprint([makeSolve({ reconstruction: "R U" })])).toEqual([]);
    expect(computeFaceSpeedFingerprint([makeSolve({ moveTimestamps: [100, 200] })])).toEqual([]);
  });

  it("skips a solve whose token count doesn't match its timestamp count", () => {
    expect(
      computeFaceSpeedFingerprint([makeSolve({ reconstruction: "R U F", moveTimestamps: [100, 200] })]),
    ).toEqual([]);
  });

  it("attributes each move's gap to its face, skipping the first move (its gap runs from the timer start)", () => {
    // R at 100ms (first move, skipped), U at 300ms (gap 200), R at 350ms (gap 50), R at 420 (gap 70)
    const solves = [makeSolve({ reconstruction: "R U R R", moveTimestamps: [100, 300, 350, 420] })];
    const result = computeFaceSpeedFingerprint(solves);
    const r = result.find((f) => f.face === "R")!;
    const u = result.find((f) => f.face === "U")!;
    expect(r.turnCount).toBe(2);
    expect(r.avgGapMs).toBeCloseTo((50 + 70) / 2);
    expect(u.turnCount).toBe(1);
    expect(u.avgGapMs).toBeCloseTo(200);
  });

  it("a long look before a move doesn't make that face look slow to turn", () => {
    // Quick U turns throughout, but every U follows a 1.5s recognition pause once.
    const solves = [makeSolve({ reconstruction: "R U U R U", moveTimestamps: [100, 1600, 1700, 1800, 1900] })];
    const u = computeFaceSpeedFingerprint(solves).find((f) => f.face === "U")!;
    expect(u.avgGapMs).toBeCloseTo(100);
    expect(u.turnCount).toBe(2);
    expect(u.pausesBefore).toBe(1);
  });

  it("ignores rotations and slices, which have no single face", () => {
    const solves = [makeSolve({ reconstruction: "U x R y", moveTimestamps: [0, 50, 150, 250] })];
    const result = computeFaceSpeedFingerprint(solves);
    expect(result).toHaveLength(1);
    expect(result[0].face).toBe("R");
  });

  it("counts wide moves toward their base face", () => {
    const solves = [makeSolve({ reconstruction: "U Rw", moveTimestamps: [0, 120] })];
    const result = computeFaceSpeedFingerprint(solves);
    expect(result).toEqual([{ face: "R", avgGapMs: 120, turnCount: 1, pausesBefore: 0 }]);
  });
});

describe("computeLookaheadScore", () => {
  it("returns null with no eligible solves", () => {
    expect(computeLookaheadScore([makeSolve({})])).toBeNull();
  });

  it("reads the pause right after the F2L and OLL boundaries", () => {
    // 6 moves; splits = [cross@100, f2l@300, oll@500]. F2L boundary lands on
    // move index 1 (t=300); the pause before move index 2 (t=450) is 150ms.
    // OLL boundary lands on move index 3 (t=500); pause before index 4 (t=650) is 150ms.
    const solve = makeSolve({
      splits: [100, 300, 500],
      moveTimestamps: [100, 300, 450, 500, 650, 700],
      reconstruction: "U R U R U R",
    });
    const result = computeLookaheadScore([solve]);
    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(1);
    expect(result!.avgPauseMs).toBeCloseTo(150);
  });

  it("sorts the per-solve trend chronologically", () => {
    const base = { splits: [10, 20, 30] as number[], moveTimestamps: [10, 20, 25, 30, 40, 50] as number[] };
    const later = makeSolve({ ...base, date: 500, id: "later" });
    const earlier = makeSolve({ ...base, date: 100, id: "earlier" });
    const result = computeLookaheadScore([later, earlier]);
    expect(result!.perSolve.map((r) => r.date)).toEqual([100, 500]);
  });
});

describe("computeEfficiencyPoints", () => {
  it("skips solves without a reconstruction or that DNF'd", () => {
    expect(computeEfficiencyPoints([makeSolve({}), makeSolve({ reconstruction: "R", penalty: "dnf" })])).toEqual([]);
  });

  it("computes move count and tps from the reconstruction and final time", () => {
    const solve = makeSolve({ reconstruction: "R U R' U'", timeMs: 2000, penalty: "none" });
    const [point] = computeEfficiencyPoints([solve]);
    expect(point.moveCount).toBe(4);
    expect(point.timeMs).toBe(2000);
    expect(point.tps).toBeCloseTo(2);
  });

  it("uses the +2-adjusted final time, not the raw time", () => {
    const solve = makeSolve({ reconstruction: "R U", timeMs: 1000, penalty: "plus2" });
    const [point] = computeEfficiencyPoints([solve]);
    expect(point.timeMs).toBe(3000);
  });
});

describe("computeCoachTip", () => {
  it("returns null with no smart-cube data", () => {
    expect(computeCoachTip([makeSolve({})])).toBeNull();
  });

  it("flags a slow-lookahead pattern once there's enough sample", () => {
    const makeLookaheadSolve = (id: string, date: number) =>
      makeSolve({
        id,
        date,
        splits: [100, 300, 1500],
        moveTimestamps: [100, 300, 1300, 1500, 2500, 2600],
        reconstruction: "U R U R U R",
      });
    const solves = [makeLookaheadSolve("a", 1), makeLookaheadSolve("b", 2), makeLookaheadSolve("c", 3)];
    const tip = computeCoachTip(solves);
    expect(tip).not.toBeNull();
    expect(tip!.title).toMatch(/lookahead/i);
  });
});
