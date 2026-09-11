import { describe, expect, it } from "vitest";
import { STAT_TILES } from "./statTiles";
import type { Solve } from "@/types";

function makeSolve(overrides: Partial<Solve>): Solve {
  return {
    id: overrides.id ?? `s-${Math.random()}`,
    sessionId: "sess1",
    timeMs: 10000,
    penalty: "none",
    scramble: "R U R' U'",
    date: 1,
    ...overrides,
  };
}

function find(id: string) {
  const def = STAT_TILES.find((t) => t.id === id);
  if (!def) throw new Error(`no tile registered with id ${id}`);
  return def;
}

describe("STAT_TILES registry", () => {
  it("has at least 100 tiles, each with a unique id", () => {
    const ids = new Set(STAT_TILES.map((t) => t.id));
    expect(ids.size).toBe(STAT_TILES.length);
    expect(STAT_TILES.length).toBeGreaterThanOrEqual(100);
  });

  it("every tile has a non-empty category and label", () => {
    for (const t of STAT_TILES) {
      expect(t.category.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it("returns null (not a throw) on a completely empty solve list", () => {
    for (const t of STAT_TILES) {
      expect(() => t.compute([], [])).not.toThrow();
    }
  });
});

describe("representative tile correctness", () => {
  it("best-single picks the minimum final time", () => {
    const solves = [makeSolve({ timeMs: 9000 }), makeSolve({ timeMs: 5000 }), makeSolve({ timeMs: 7000, penalty: "plus2" })];
    const result = find("best-single").compute(solves, solves);
    expect(result?.value).toBe("5.00");
  });

  it("dnf-rate is computed against rawSolves, not the normal-filtered list", () => {
    const raw = [makeSolve({ penalty: "dnf" }), makeSolve({ penalty: "none" }), makeSolve({ penalty: "none" }), makeSolve({ penalty: "none" })];
    const result = find("dnf-rate").compute([], raw);
    expect(result?.value).toBe("25.0%");
  });

  it("sub-10 counts only solves under 10 seconds", () => {
    const solves = [makeSolve({ timeMs: 8000 }), makeSolve({ timeMs: 9500 }), makeSolve({ timeMs: 11000 })];
    const result = find("sub-10").compute(solves, solves);
    expect(result?.value).toBe("2");
  });

  it("fewest-moves ignores solves with no reconstruction", () => {
    const solves = [makeSolve({ reconstruction: "R U R' U' R U R' U'" }), makeSolve({ reconstruction: "R U R'" }), makeSolve({})];
    const result = find("fewest-moves").compute(solves, solves);
    expect(result?.value).toBe("3");
  });

  it("face-turns-R counts only R-family tokens", () => {
    const solves = [makeSolve({ reconstruction: "R U R' Rw U' x" })];
    const result = find("face-turns-R").compute(solves, solves);
    // R, R', Rw all count toward the R face; U/U'/x do not.
    expect(result?.value).toBe("3");
  });

  it("event-count-oh only counts solves tagged oh, from rawSolves", () => {
    const raw = [makeSolve({ event: "oh" }), makeSolve({ event: "oh" }), makeSolve({}), makeSolve({ event: "feet" })];
    const result = find("event-count-oh").compute([], raw);
    expect(result?.value).toBe("2");
  });

  it("phase-avg-cross averages stored crossMs across solves that have it", () => {
    const solves = [makeSolve({ crossMs: 2000 }), makeSolve({ crossMs: 4000 }), makeSolve({})];
    const result = find("phase-avg-cross").compute(solves, solves);
    expect(result?.value).toBe("3.00");
  });

  it("hr-avg averages heartRate.avg across solves that have it", () => {
    const solves = [makeSolve({ heartRate: { avg: 120, max: 140 } }), makeSolve({ heartRate: { avg: 140, max: 160 } }), makeSolve({})];
    const result = find("hr-avg").compute(solves, solves);
    expect(result?.value).toBe("130 bpm");
  });

  it("total-solves returns null for an empty session", () => {
    expect(find("total-solves").compute([], [])).toBeNull();
  });

  it("the four phase-share tiles sum to ~100%, even when phase data only covers some solves", () => {
    // One solve with real phase data, several without any — the shares must
    // average each solve's own phase/total ratio, not divide two separately
    // averaged populations (which would skew against the full solve list's mean).
    const withPhases = makeSolve({ timeMs: 10000, crossMs: 2000, splits: [2000, 5000, 8000] });
    const solves = [withPhases, makeSolve({ timeMs: 9000 }), makeSolve({ timeMs: 11000 }), makeSolve({ timeMs: 8000 })];
    const shares = ["cross", "f2l", "oll", "pll"].map((p) => Number(find(`phase-share-${p}`).compute(solves, solves)!.value.replace("%", "")));
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 0);
  });
});
