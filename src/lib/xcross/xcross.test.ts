import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { crossHeuristic, solveCrossFromCube } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { crossSolved } from "@/lib/xray/common";
import { gradeXCross, solveXCross, xcrossOptions } from "./xcross";

const SCRAMBLES = [
  "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
  "R2 B2 L2 B2 D' U2 L2 R2 F2 U' B2 L F' U L' B' D L2 F D2 U'",
  "D2 F2 U' L2 U R2 D' B2 U2 L2 F' L' D' R B' U' R2 F' R' U2",
];

describe("solveXCross", () => {
  it("finds a real x-cross, no shorter than the cross alone", () => {
    for (const s of SCRAMBLES) {
      const opts = xcrossOptions(s, 9);
      expect(opts.length).toBeGreaterThan(0);
      const cube = newCube();
      cube.move(s);
      const cross = crossHeuristic(cube);
      for (const o of opts) {
        const c = cube.clone();
        c.move(o.moves.join(" "));
        expect(crossSolved(c)).toBe(true);
        expect(f2lPairSolved(c, o.pair as 0 | 1 | 2 | 3)).toBe(true);
        expect(o.moves.length).toBeGreaterThanOrEqual(cross);
      }
      for (let i = 1; i < opts.length; i++) expect(opts[i].moves.length).toBeGreaterThanOrEqual(opts[i - 1].moves.length);
    }
  });

  it("is optimal on known cases", () => {
    const one = newCube();
    one.move("F");
    expect(solveXCross(one, 2, 8)).toEqual(["F'"]);
    const four = newCube();
    four.move("R D R' F");
    const sol = solveXCross(four, 0, 8)!;
    expect(sol.length).toBeLessThanOrEqual(4);
  });

  it("gives up past the depth limit", () => {
    const cube = newCube();
    cube.move(SCRAMBLES[0]);
    expect(solveXCross(cube, 0, 2)).toBeNull();
  });
});

describe("gradeXCross", () => {
  const s = SCRAMBLES[1];
  const options = xcrossOptions(s, 9);

  it("recognises a planned optimal x-cross", () => {
    const g = gradeXCross(s, options[0].moves, options);
    expect(g.hit).toBe(true);
    expect(g.turns).toBe(options[0].moves.length);
    expect(g.verdict).toBe("Optimal x-cross!");
  });

  it("sees cross-then-pair as a miss", () => {
    const cube = newCube();
    cube.move(s);
    const cross = solveCrossFromCube(cube);
    cube.move(cross.join(" "));
    const pairMoves = solveF2L(cube)[0].moves;
    const g = gradeXCross(s, [...cross, ...pairMoves], options);
    expect(g.hit).toBe(false);
    expect(g.turns).toBe(cross.length + pairMoves.length);
    expect(g.detail).toMatch(/x-cross was there in/);
  });
});
