import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { crossSolved } from "@/lib/xray/common";
import type { Solve } from "@/types";
import { CROSS_FACES, analysisFrame, crossFaceOf, crossSolvedOn, toCrossFrame, type CrossFace } from "./crossFrame";

const SCRAMBLE = "D2 F' U2 L2 F U2 R2 B' L2 F' R' D B U R2 B L' U' F2 R";
/** A real cross on `face` for SCRAMBLE: the optimal white cross in that face's relabelled world, named back by physical face. */
function crossOn(face: CrossFace): string[] {
  const white = solveCrossOptimal(toCrossFrame(SCRAMBLE.split(" "), face).join(" "));
  const physical = (t: string) => ["U", "D", "F", "B", "R", "L"].find((f) => toCrossFrame([f], face)[0] === t[0])! + t.slice(1);
  return white.map(physical);
}

describe("colour-neutral frames", () => {
  it("finds the cross on whichever colour it was built", () => {
    for (const face of CROSS_FACES) {
      const moves = crossOn(face);
      const c = newCube();
      c.move(SCRAMBLE);
      if (moves.length) c.move(moves.join(" "));
      expect(crossSolvedOn(c, face)).toBe(true);
      expect(crossFaceOf(SCRAMBLE, moves)).toBe(face);
    }
  });

  it("relabels a solve so its cross lands on white, and leaves white solves alone", () => {
    const moves = crossOn("D");
    const solve: Solve = { id: "a", sessionId: "s", timeMs: 1, penalty: "none", scramble: SCRAMBLE, date: 0, reconstruction: moves.join(" ") };
    const framed = analysisFrame(solve);
    expect(framed).not.toBe(solve);
    const c = newCube();
    c.move(framed.scramble);
    c.move(framed.reconstruction!);
    expect(crossSolved(c)).toBe(true);
    expect(analysisFrame(solve)).toBe(framed); // memoised
    const white: Solve = { ...solve, id: "b", reconstruction: crossOn("U").join(" ") };
    expect(analysisFrame(white)).toBe(white);
  });
});
