import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { MIN_SOLVES_TO_COMPARE, garageReport } from "./cubeGarage";

let n = 0;
function solve(timeMs: number, cube: Solve["cube"] | undefined, over: Partial<Solve> = {}): Solve {
  n++;
  return {
    id: `s${n}`,
    sessionId: "x",
    timeMs,
    penalty: "none",
    scramble: "R U",
    date: 1_000_000 + n * 1000,
    moveTimestamps: [0, 100, 200, 300],
    ...(cube ? { cube } : {}),
    ...over,
  };
}
const A = { id: "mac:A", name: "GAN12 ui" };
const B = { id: "mac:B", name: "MoYu V10" };
const many = (count: number, ms: number, cube: Solve["cube"], over: Partial<Solve> = {}) => Array.from({ length: count }, () => solve(ms, cube, over));

describe("garageReport", () => {
  it("gives each cube its own record, newest-used first", () => {
    const r = garageReport([...many(3, 10000, A), ...many(2, 12000, B)]);
    expect(r.cubes.map((c) => c.id)).toEqual(["mac:B", "mac:A"]);
    expect(r.cubes.find((c) => c.id === "mac:A")).toMatchObject({ solves: 3, best: 10000, median: 10000, dnfs: 0 });
  });

  it("uses the nickname as the label, else the advertised name", () => {
    const r = garageReport(many(2, 10000, A), { "mac:A": "  Old faithful " });
    expect(r.cubes[0].label).toBe("Old faithful");
    expect(garageReport(many(2, 10000, A)).cubes[0].label).toBe("GAN12 ui");
  });

  it("counts DNFs out of the times but into the solve count, and +2 into the time", () => {
    const r = garageReport([solve(10000, A), solve(9000, A, { penalty: "dnf" }), solve(8000, A, { penalty: "plus2" })]);
    const c = r.cubes[0];
    expect(c.solves).toBe(3);
    expect(c.dnfs).toBe(1);
    expect(c.best).toBe(10000);
  });

  it("measures turns per second from the recorded turns", () => {
    const r = garageReport([solve(2000, A, { moveTimestamps: Array.from({ length: 20 }, (_, i) => i * 100) })]);
    expect(r.cubes[0].avgTps).toBeCloseTo(10, 5);
  });

  it("reports how often a cube lost a turn", () => {
    const list = [...many(8, 10000, { ...A, corrected: false }), ...many(2, 10000, { ...A, corrected: true })];
    expect(garageReport(list).cubes[0].correctedRate).toBeCloseTo(0.2, 5);
  });

  it("counts smart solves from before tracking, but not keyboard solves, and ignores tagged events", () => {
    const r = garageReport([solve(10000, undefined), solve(10000, undefined), solve(10000, undefined, { moveTimestamps: undefined }), solve(10000, A, { event: "oh" })]);
    expect(r.untracked).toBe(2);
    expect(r.cubes).toHaveLength(0);
  });

  describe("notes", () => {
    it("compares cubes only once both have enough solves", () => {
      const thin = garageReport([...many(MIN_SOLVES_TO_COMPARE - 1, 9000, A), ...many(MIN_SOLVES_TO_COMPARE, 12000, B)]);
      expect(thin.notes.join(" ")).not.toMatch(/quicker/);
      const full = garageReport([...many(MIN_SOLVES_TO_COMPARE, 9000, A), ...many(MIN_SOLVES_TO_COMPARE, 12000, B)]);
      expect(full.notes[0]).toMatch(/25% quicker on GAN12 ui than on MoYu V10/);
    });

    it("calls near-identical cubes the same rather than inventing a winner", () => {
      const r = garageReport([...many(MIN_SOLVES_TO_COMPARE, 10000, A), ...many(MIN_SOLVES_TO_COMPARE, 10100, B)]);
      expect(r.notes[0]).toMatch(/No real speed difference/);
    });

    it("flags a cube that keeps losing turns", () => {
      const list = [...many(8, 10000, { ...A, corrected: false }), ...many(4, 10000, { ...A, corrected: true })];
      expect(garageReport(list).notes.join(" ")).toMatch(/lost a turn over Bluetooth in 33%/);
    });

    it("says nothing with one healthy cube", () => {
      expect(garageReport(many(20, 10000, A)).notes).toEqual([]);
    });
  });
});
