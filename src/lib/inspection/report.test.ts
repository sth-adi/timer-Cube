import { describe, expect, it } from "vitest";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { inspectionReport, summarizeInspection } from "./report";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

function times(n: number, pauseBefore?: number) {
  let t = 0;
  return Array.from({ length: n }, (_, i) => {
    if (i > 0) t += 150 + (i === pauseBefore ? 900 : 0);
    return t;
  });
}

describe("inspectionReport", () => {
  const cross = solveCrossOptimal(SCRAMBLE);

  it("grades a fully planned optimal cross highly", () => {
    const r = inspectionReport(SCRAMBLE, cross, times(cross.length))!;
    expect(r.crossTurns).toBe(cross.length);
    expect(r.optimalTurns).toBe(cross.length);
    expect(r.pauses).toBe(0);
    expect(r.plannedFraction).toBe(1);
    expect(["A", "B"]).toContain(r.grade);
  });

  it("sees where planning ran out", () => {
    const r = inspectionReport(SCRAMBLE, cross, times(cross.length, 2))!;
    expect(r.plannedTurns).toBe(2);
    expect(r.pauses).toBe(1);
    expect(r.score).toBeLessThan(inspectionReport(SCRAMBLE, cross, times(cross.length))!.score);
    expect(r.notes[0]).toMatch(/Planned 2 of/);
  });

  it("penalises a long way round", () => {
    const detour = ["R", "R'", "U", "U'", ...cross];
    const r = inspectionReport(SCRAMBLE, detour, times(detour.length))!;
    expect(r.crossTurns).toBe(cross.length + 4);
    expect(r.notes.join(" ")).toMatch(/were enough/);
  });

  it("summarizes a history with a trend", () => {
    const bad = inspectionReport(SCRAMBLE, cross, times(cross.length, 1))!;
    const good = inspectionReport(SCRAMBLE, cross, times(cross.length))!;
    const h = summarizeInspection([bad, bad, bad, good, good, good])!;
    expect(h.solves).toBe(6);
    expect(h.fullyPlannedRate).toBe(0.5);
    expect(h.trend).toBeGreaterThan(0);
  });
});
