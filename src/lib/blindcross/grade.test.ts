import { describe, expect, it } from "vitest";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { gradeBlindCross, summarizeBlind, type BlindAttempt } from "./grade";

const SCRAMBLE = "R U2 F' L D B2 R' D' L2 F U' B R2 D2 F2 L' U";

describe("gradeBlindCross", () => {
  it("scores an optimal cross as perfect", () => {
    const opt = solveCrossOptimal(SCRAMBLE);
    const r = gradeBlindCross(SCRAMBLE, opt, "cross");
    expect(r.success).toBe(true);
    expect(r.turns).toBe(r.optimal);
    expect(r.onPlan).toBe(r.optimal);
    expect(r.wanderedAt).toBeNull();
    expect(r.verdict).toMatch(/Perfect/);
  });

  it("merges quarter turns the cube reports for a half turn", () => {
    const r = gradeBlindCross("F2", ["F", "F"], "cross");
    expect(r.moves).toEqual(["F2"]);
    expect(r.success).toBe(true);
  });

  it("finds the turn where the plan went off the optimal path", () => {
    const r = gradeBlindCross("F", ["B", "F'"], "cross");
    expect(r.success).toBe(false);
    expect(r.wanderedAt).toBe(0);
    expect(r.edges.find((e) => e.name === "white-blue")!.status).not.toBe("solved");
    expect(r.edges.find((e) => e.name === "white-green")!.status).toBe("solved");
    expect(r.detail).toMatch(/turn 1 \(B\)/);
  });

  it("reports a stop with no turns", () => {
    const r = gradeBlindCross("F U' R U", [], "cross");
    expect(r.success).toBe(false);
    expect(r.edges.some((e) => e.status !== "solved")).toBe(true);
    expect(r.detail).toBe("No turns made.");
  });

  it("needs a pair for an x-cross", () => {
    // Engine frame: the cross lives on U, so a pair is set up with D turns.
    const r = gradeBlindCross("R D' R'", ["R", "D", "R'"], "xcross");
    expect(r.success).toBe(true);
    expect(r.pair).toBe("Green-Red");
    const crossOnly = gradeBlindCross(`${SCRAMBLE} ${solveCrossOptimal(SCRAMBLE).join(" ")}`, [], "xcross");
    expect(crossOnly.edges.every((e) => e.status === "solved")).toBe(true);
    expect(crossOnly.success).toBe(false);
    expect(crossOnly.verdict).toMatch(/no F2L pair/);
  });
});

describe("summarizeBlind", () => {
  it("tracks streaks and success rate per level", () => {
    const mk = (success: boolean, i: number): BlindAttempt => ({ date: i, level: "cross", success, turns: 7, optimal: 6, inspectMs: 8000 });
    const s = summarizeBlind([mk(true, 1), mk(false, 2), mk(true, 3), mk(true, 4), mk(true, 5)], "cross")!;
    expect(s.attempts).toBe(5);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.successRate).toBeCloseTo(0.8);
    expect(s.avgExtra).toBe(1);
    expect(summarizeBlind([], "xcross")).toBeNull();
  });
});
