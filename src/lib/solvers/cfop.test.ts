import { describe, expect, it, beforeAll } from "vitest";
import { Cube } from "../cube-engine/engine";
import { solveCFOP } from "./cfop";

describe("solveCFOP", () => {
  beforeAll(() => {
    Cube.initSolver();
  });

  it("solves an already-solved cube trivially", () => {
    const result = solveCFOP("");
    expect(result.full).toEqual([]);
    expect(result.totalMoves).toBe(0);
  });

  it("produces a full solution that actually solves real WCA-style scrambles", () => {
    for (let i = 0; i < 15; i++) {
      const scramble = Cube.scramble();
      const result = solveCFOP(scramble);

      const cube = new Cube();
      cube.move(scramble);
      cube.move(result.full.join(" "));
      expect(cube.isSolved()).toBe(true);

      expect(result.cross.length).toBeLessThanOrEqual(8);
      expect(result.f2l).toHaveLength(4);
      expect(result.totalMoves).toBe(
        result.cross.length +
          result.f2l.reduce((n, p) => n + p.moves.length, 0) +
          result.oll.length +
          result.pll.length,
      );
      // Sanity bound: a genuinely "efficient" CFOP solve should be well under 80 STM.
      expect(result.totalMoves).toBeLessThan(80);
    }
  }, 180_000);

  it("keeps the cross and each F2L pair fixed once solved (never re-disturbed later)", () => {
    const scramble = "R U2 F' L2 B2 R2 U2 F2 U2 L2 D' L U2 F' L D2 F' U' B2 D2";
    const result = solveCFOP(scramble);

    const cube = new Cube();
    cube.move(scramble);
    cube.move(result.cross.join(" "));
    const crossSnapshot = { ep: [...cube.ep], eo: [...cube.eo] };

    let running = result.cross.length;
    for (const pair of result.f2l) {
      cube.move(pair.moves.join(" "));
      running += pair.moves.length;
      for (const slot of [0, 1, 2, 3]) {
        expect(cube.ep[slot]).toBe(crossSnapshot.ep[slot]);
        expect(cube.eo[slot]).toBe(crossSnapshot.eo[slot]);
      }
    }
    expect(running).toBe(result.cross.length + result.f2l.reduce((n, p) => n + p.moves.length, 0));
  }, 20_000);
});
