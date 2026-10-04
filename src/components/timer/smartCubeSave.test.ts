import { describe, expect, it } from "vitest";
import { inspectionPenaltyFor, phaseSplits, solveSaveExtras, type PhaseBoundaries } from "./smartCubeSave";

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
