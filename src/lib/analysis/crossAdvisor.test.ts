import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { MIN_SCRAMBLES, analyzeCrossOrientations } from "./crossAdvisor";

const SCRAMBLES = [
  "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
  "D2 B2 U' R2 U F2 D L2 U' B2 R' D' F L2 U2 B' R' F' U'",
  "F2 D' L2 D B2 U2 R2 D' F2 R' B' D2 R U' F U2 L' B2 R",
  "U R2 F2 D2 L2 B2 U' R2 F2 U2 L' B R' D2 F' L B2 U' R",
  "L2 D2 F2 U2 R2 B2 D L2 F R B' U' L D' R2 F' U2 B",
];

function makeSolve(id: string, scramble: string): Solve {
  return { id, sessionId: "s", timeMs: 10000, penalty: "none", scramble, date: Number(id), reconstruction: undefined };
}

describe("analyzeCrossOrientations", () => {
  it("returns null under MIN_SCRAMBLES eligible solves", () => {
    const solves = SCRAMBLES.slice(0, 2).map((s, i) => makeSolve(`${i}`, s));
    expect(analyzeCrossOrientations(solves)).toBeNull();
  });

  it("ignores DNFs when counting eligible scrambles", () => {
    const solves = Array.from({ length: MIN_SCRAMBLES }, (_, i) => makeSolve(`${i}`, SCRAMBLES[i % SCRAMBLES.length]));
    solves.push({ ...makeSolve("dnf", SCRAMBLES[0]), penalty: "dnf" });
    const report = analyzeCrossOrientations(solves)!;
    expect(report.current.scrambles).toBe(MIN_SCRAMBLES);
  });

  it("covers exactly the 6 faces once each, current is always white/U, and best is never longer than current", () => {
    const solves = Array.from({ length: MIN_SCRAMBLES }, (_, i) => makeSolve(`${i}`, SCRAMBLES[i % SCRAMBLES.length]));
    const report = analyzeCrossOrientations(solves)!;
    expect(report).not.toBeNull();
    expect(report.all.map((s) => s.face).sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
    expect(new Set(report.all.map((s) => s.colorName)).size).toBe(6);
    expect(report.current.face).toBe("U");
    expect(report.current.colorName).toBe("white");
    expect(report.best.avgLen).toBeLessThanOrEqual(report.current.avgLen);
    expect(report.all[0]).toBe(report.best);
  });

  it("the current (white/U) orientation's average matches solveCrossOptimal directly, as an independent check", () => {
    const solves = Array.from({ length: MIN_SCRAMBLES }, (_, i) => makeSolve(`${i}`, SCRAMBLES[i % SCRAMBLES.length]));
    const report = analyzeCrossOrientations(solves)!;
    const expected = solves.reduce((sum, s) => sum + solveCrossOptimal(s.scramble).length, 0) / solves.length;
    expect(report.current.avgLen).toBeCloseTo(expected, 6);
  });
});
