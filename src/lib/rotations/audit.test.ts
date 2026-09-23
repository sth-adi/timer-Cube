import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { analyzeRotations, buildRotationReport, gripAt, slotPosition, startGrip, type SolveRotations } from "./audit";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

describe("grip tracking", () => {
  it("reads the starting grip off the oriented reconstruction", () => {
    expect(startGrip("z2 D y R").map((v) => Math.round(v) + 0)).toEqual(HOME_ORIENTATION.map((v) => v + 0));
  });

  it("places slots relative to the cuber", () => {
    // Yellow top, green front: the green-red pair is front-LEFT (red is on your left).
    expect(slotPosition(HOME_ORIENTATION, 0)).toBe("FL");
    expect(slotPosition(HOME_ORIENTATION, 1)).toBe("FR");
    expect(slotPosition(HOME_ORIENTATION, 2)).toBe("BR");
    expect(slotPosition(HOME_ORIENTATION, 3)).toBe("BL");
    // A y turns the front to the left, so front-left goes to back-left.
    const after = gripAt(HOME_ORIENTATION, [{ atMs: 100, token: "y" }], 200);
    expect(slotPosition(after, 0)).toBe("BL");
    expect(slotPosition(gripAt(HOME_ORIENTATION, [{ atMs: 100, token: "y" }], 50), 0)).toBe("FL");
  });
});

describe("analyzeRotations", () => {
  it("buckets rotations by phase and prices them against the normal gap", () => {
    const cross = solveCrossOptimal(SCRAMBLE);
    const cube = new Cube();
    cube.move(SCRAMBLE);
    cube.move(cross.join(" "));
    const moves = [...cross, ...solveF2L(cube).flatMap((p) => p.moves)];
    const timesMs = moves.map((_, i) => i * 150 + (i > cross.length ? 500 : 0));
    const rotAt = (cross.length + 0.5) * 150; // between the cross and the first pair, inside the 500ms gap
    const r = analyzeRotations({ scramble: SCRAMBLE, moves, timesMs, rotations: [{ atMs: rotAt, token: "y" }], orientedReconstruction: "z2 R" })!;
    expect(r.total).toBe(1);
    expect(r.byPhase.f2l).toBe(1);
    expect(r.costs[0]).toBe(500);
    expect(r.pairs.length).toBeGreaterThan(0);
    expect(r.pairs[0].rotations).toBe(1);
    expect(r.pairs.slice(1).every((p) => p.rotations === 0)).toBe(true);
  });
});

describe("buildRotationReport", () => {
  it("calls out a back-slot rotation habit", () => {
    const solve: SolveRotations = {
      total: 3,
      byPhase: { cross: 0, f2l: 2, ll: 1 },
      pairs: [
        { pair: 3, startPos: "BL", insertPos: "FR", rotations: 1, totalMs: 1800 },
        { pair: 0, startPos: "FR", insertPos: "FR", rotations: 0, totalMs: 1200 },
        { pair: 2, startPos: "BR", insertPos: "FL", rotations: 1, totalMs: 1700 },
        { pair: 1, startPos: "FL", insertPos: "FL", rotations: 0, totalMs: 1100 },
      ],
      costs: [300, 250, 200],
      tokens: ["y", "y'", "y"],
    };
    const r = buildRotationReport(Array.from({ length: 5 }, () => solve))!;
    expect(r.perSolve).toBe(3);
    expect(r.bySlot.find((s) => s.pos === "BL")!.rotatedRate).toBe(1);
    expect(r.tokenCounts[0]).toEqual({ token: "y", count: 10 });
    expect(r.insights.join(" ")).toMatch(/back-left/);
    expect(r.insights.join(" ")).toMatch(/Pairs where you rotate take 1.75s/);
    expect(r.costPerSolveMs).toBe(750);
  });
});
