import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { compareSolves } from "./compare";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

function capture(perTurn: number, crossPause = 0) {
  const cross = solveCrossOptimal(SCRAMBLE);
  const cube = new Cube();
  cube.move(SCRAMBLE);
  cube.move(cross.join(" "));
  const moves = [...cross, ...solveF2L(cube).flatMap((p) => p.moves)];
  return { moves, timesMs: moves.map((_, i) => i * perTurn + (i >= cross.length ? crossPause : 0)), cross };
}

describe("compareSolves", () => {
  it("finds where the rematch was faster", () => {
    const a = capture(200, 1000);
    const b = capture(200, 0);
    const c = compareSolves(SCRAMBLE, a, b);
    expect(c.totalB - c.totalA).toBe(-1000);
    expect(c.verdict).toMatch(/Rematch won by 1.00s/);
    expect(c.sameCross).toBe(true);
    expect(c.sameOrder).toBe(true);
    expect(c.gain!.label).toBe("Pair 1");
    expect(c.gain!.delta).toBe(-1000);
    expect(c.milestones[0].delta).toBe(0);
    expect(c.turnsA).toBe(c.turnsB);
  });

  it("treats a fumble that cancels out as the same path, but slower", () => {
    const a = capture(150);
    const b = { moves: ["U", "U'", ...a.moves], timesMs: [0, 100, ...a.timesMs.map((t) => t + 200)] };
    const c = compareSolves(SCRAMBLE, a, b);
    // U U' merges away, so the cross path is the same set of turns.
    expect(c.sameCross).toBe(true);
    expect(c.loss).not.toBeNull();
    expect(c.verdict).toMatch(/original still wins/);
  });
});
