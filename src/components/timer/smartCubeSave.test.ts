import { describe, expect, it } from "vitest";
import { assembleSolveSave, guardedStep, inspectionPenaltyFor, phaseSplits, solveSaveExtras, type PhaseBoundaries, type SolveSaveSteps } from "./smartCubeSave";
import type { TurnRepair } from "@/lib/smartcube/turnRepair";
import type { Milestones } from "@/lib/smartcube/milestones";

const full: PhaseBoundaries = { cross: 1500, f2l: 6000, oll: 9000, pll: null };

describe("phaseSplits", () => {
  it("is [cross, f2l, oll] once all three are known", () => {
    expect(phaseSplits(full)).toEqual([1500, 6000, 9000]);
  });

  it("is undefined while any is missing", () => {
    expect(phaseSplits({ ...full, oll: null })).toBeUndefined();
    expect(phaseSplits({ ...full, f2l: null })).toBeUndefined();
    expect(phaseSplits({ ...full, cross: null })).toBeUndefined();
    expect(phaseSplits(null)).toBeUndefined();
  });
});

describe("inspectionPenaltyFor", () => {
  it("is undefined with inspection off or no start", () => {
    expect(inspectionPenaltyFor(10_000, null)).toBeUndefined();
    expect(inspectionPenaltyFor(null, 1000)).toBeUndefined();
  });

  it("follows the WCA limits", () => {
    expect(inspectionPenaltyFor(1000 + 15_000, 1000)).toBe("none");
    expect(inspectionPenaltyFor(1000 + 15_001, 1000)).toBe("plus2");
    expect(inspectionPenaltyFor(1000 + 17_000, 1000)).toBe("plus2");
    expect(inspectionPenaltyFor(1000 + 17_001, 1000)).toBe("dnf");
  });
});

describe("solveSaveExtras", () => {
  it("carries the inspection penalty and the splits", () => {
    expect(solveSaveExtras({ startedAtMs: 20_000, inspectionStartedAtMs: 4000, boundaries: full })).toEqual({
      penalty: "plus2",
      splits: [1500, 6000, 9000],
    });
  });

  it("a chosen DNF wins over an inspection +2 and keeps the splits", () => {
    expect(solveSaveExtras({ startedAtMs: 20_000, inspectionStartedAtMs: 4000, boundaries: full, forcePenalty: "dnf" })).toEqual({
      penalty: "dnf",
      splits: [1500, 6000, 9000],
    });
  });

  it("a chosen DNF works with inspection off", () => {
    expect(solveSaveExtras({ startedAtMs: 20_000, inspectionStartedAtMs: null, boundaries: null, forcePenalty: "dnf" })).toEqual({
      penalty: "dnf",
      splits: undefined,
    });
  });

  it("is empty for a clean solve with no splits yet", () => {
    expect(solveSaveExtras({ startedAtMs: 20_000, inspectionStartedAtMs: null, boundaries: { ...full, oll: null } })).toEqual({
      penalty: undefined,
      splits: undefined,
    });
  });
});

describe("guardedStep", () => {
  it("returns the step's value, or the fallback when it throws", () => {
    expect(guardedStep(() => 5, 0)).toBe(5);
    const seen: unknown[] = [];
    expect(guardedStep(() => { throw new Error("boom"); }, 7, (e) => seen.push(e))).toBe(7);
    expect(seen).toHaveLength(1);
  });
});

describe("assembleSolveSave", () => {
  const input = { startedAtMs: 1000, reconstruction: "R U R' U'", moveTimestampsRel: [0, 100, 200, 300], correctedDuringSolve: false };
  const gyroSummary = { rotations: [], orientedReconstruction: "R U", stream: [] } as never;
  const gazeReport = { samples: 3 } as never;
  const boom = () => {
    throw new Error("boom");
  };
  const ok: SolveSaveSteps = {
    gyro: () => gyroSummary,
    startFacelets: () => "F".repeat(54),
    gaze: () => gazeReport,
    repair: () => "intact",
    milestonesOf: () => null,
  };
  const fixed: TurnRepair = { tokens: ["R", "U", "R'", "U'", "F"], times: [0, 100, 150, 200, 300], change: { kind: "inserted", index: 4, tokens: ["F"] }, alternatives: 0 };
  const milestones = { crossAtMs: 1500, f2lAtMs: 4000, ollAtMs: 6000 } as unknown as Milestones;

  it("keeps the recorded turns and every extra when nothing throws", () => {
    const out = assembleSolveSave(input, ok);
    expect(out.failed).toEqual([]);
    expect(out.gyro).toBe(gyroSummary);
    expect(out.gaze).toEqual({ report: gazeReport, facelets: "F".repeat(54) });
    expect(out.reconstruction).toBe("R U R' U'");
    expect(out.moveTimestamps).toEqual([0, 100, 200, 300]);
    expect(out.turnLoss).toBeUndefined();
  });

  it("still returns the time-bearing basics when the gyro, facelets and gaze steps all throw", () => {
    const out = assembleSolveSave(input, { ...ok, gyro: boom, startFacelets: boom, gaze: boom });
    expect(out.gyro).toBeNull();
    expect(out.gaze).toBeNull();
    expect(out.reconstruction).toBe("R U R' U'");
    expect(out.moveTimestamps).toEqual([0, 100, 200, 300]);
    expect(out.failed).toEqual(["gyro", "facelets"]);
  });

  it("drops only the gaze when it alone throws", () => {
    const out = assembleSolveSave(input, { ...ok, gaze: boom });
    expect(out.gyro).toBe(gyroSummary);
    expect(out.gaze).toBeNull();
    expect(out.failed).toEqual(["gaze"]);
  });

  it("saves time-only when the repair throws on a solve that lost a turn", () => {
    const out = assembleSolveSave({ ...input, correctedDuringSolve: true }, { ...ok, repair: boom });
    expect(out.reconstruction).toBeUndefined();
    expect(out.moveTimestamps).toBeUndefined();
    expect(out.turnLoss).toEqual({ kind: "time-only" });
    expect(out.failed).toContain("repair");
  });

  it("saves time-only when nothing can be repaired", () => {
    const out = assembleSolveSave({ ...input, correctedDuringSolve: true }, { ...ok, repair: () => null });
    expect(out.reconstruction).toBeUndefined();
    expect(out.turnLoss).toEqual({ kind: "time-only" });
  });

  it("keeps the repaired turns and derives splits relative to the start", () => {
    const out = assembleSolveSave({ ...input, correctedDuringSolve: true }, { ...ok, repair: () => fixed, milestonesOf: () => milestones });
    expect(out.reconstruction).toBe("R U R' U' F");
    expect(out.moveTimestamps).toEqual([0, 100, 150, 200, 300]);
    expect(out.repairedCrossMs).toBe(500);
    expect(out.repairedSplits).toEqual([500, 3000, 5000]);
    expect(out.turnLoss).toEqual({ kind: "repaired", change: fixed.change });
    expect(out.adopt?.times).toEqual([1000, 1100, 1150, 1200, 1300]);
  });

  it("keeps the repaired turns but no splits or adopt when the milestones step throws", () => {
    const out = assembleSolveSave({ ...input, correctedDuringSolve: true }, { ...ok, repair: () => fixed, milestonesOf: boom });
    expect(out.reconstruction).toBe("R U R' U' F");
    expect(out.repairedSplits).toBeUndefined();
    expect(out.repairedCrossMs).toBeUndefined();
    expect(out.adopt).toBeNull();
    expect(out.turnLoss).toEqual({ kind: "repaired", change: fixed.change });
    expect(out.failed).toEqual(["milestones"]);
  });

  it("does not run the repair at all when no turn was lost", () => {
    const repair = () => {
      throw new Error("must not run");
    };
    expect(assembleSolveSave(input, { ...ok, repair }).failed).toEqual([]);
  });
});
