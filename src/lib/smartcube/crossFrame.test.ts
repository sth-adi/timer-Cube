import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { crossSolved } from "@/lib/xray/common";
import type { Solve } from "@/types";
import { CROSS_FACES, analysisFrame, crossFaceOf, crossSolvedOn, pairColors, physicalFace, relabelFacelets, relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";
import { PAIR_NAMES } from "@/lib/analysis/mistakeRadar";

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

  it("names turns and pairs by their real colours", () => {
    expect([0, 1, 2, 3].map((p) => pairColors(p, "U"))).toEqual([...PAIR_NAMES]);
    for (const face of CROSS_FACES) {
      for (const f of ["U", "D", "F", "B", "R", "L"]) expect(physicalFace(relabelMove(f, face), face)).toBe(f);
      // A pair's two colours are side colours: never the cross colour or the one opposite it.
      const cross = face;
      const opposite = { U: "D", D: "U", F: "B", B: "F", R: "L", L: "R" }[face];
      const word = { U: "white", D: "yellow", F: "green", B: "blue", R: "red", L: "orange" };
      for (let p = 0; p < 4; p++) {
        const colours = pairColors(p, face).split("-");
        expect(colours).not.toContain(word[cross]);
        expect(colours).not.toContain(word[opposite as CrossFace]);
      }
    }
  });

  it("relabels a whole sticker state exactly as it relabels the moves that made it", () => {
    const seqs = [SCRAMBLE, "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'", "U"];
    for (const face of CROSS_FACES) {
      for (const seq of seqs) {
        const a = newCube();
        a.move(seq);
        const b = newCube();
        b.move(toCrossFrame(seq.split(" "), face).join(" "));
        expect(relabelFacelets(a.asString(), face)).toBe(b.asString());
      }
    }
  });
});
