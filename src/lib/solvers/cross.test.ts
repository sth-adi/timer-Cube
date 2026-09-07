import { describe, expect, it, beforeAll } from "vitest";
import { Cube } from "../cube-engine/engine";
import { solveCrossOptimal } from "./cross";

function crossSolved(cube: ReturnType<(typeof Cube)["prototype"]["clone"]>): boolean {
  for (const slot of [0, 1, 2, 3]) {
    if (cube.ep[slot] !== slot || cube.eo[slot] !== 0) return false;
  }
  return true;
}

function randomAlg(length: number): string {
  const faces = ["U", "R", "F", "D", "L", "B"];
  const suffixes = ["", "2", "'"];
  const moves: string[] = [];
  let lastFace = -1;
  for (let i = 0; i < length; i++) {
    let face = Math.floor(Math.random() * 6);
    while (face === lastFace) face = Math.floor(Math.random() * 6);
    lastFace = face;
    const suffix = suffixes[Math.floor(Math.random() * 3)];
    moves.push(faces[face] + suffix);
  }
  return moves.join(" ");
}

describe("solveCrossOptimal", () => {
  beforeAll(() => {
    Cube.initSolver();
  });

  it("solves the cross on an already-solved cube with 0 moves", () => {
    expect(solveCrossOptimal("")).toEqual([]);
  });

  it("produces a move sequence that actually solves the cross, within 8 moves", () => {
    for (const scramble of [
      "R U R' U'",
      "F2 D' B2 U2 F2 R2 D' F2 R2 F2",
      "L2 F2 D' B2 U2 F2 R2 D' F2 R2 F2 D2 R' F D2 L F2 R D' B R'",
      "U2 F L' U2 F R2 D F U2 F2 D R2 D B2 U' B2 L2 U2 F2 L2 F",
    ]) {
      const moves = solveCrossOptimal(scramble);
      const cube = new Cube();
      cube.move(scramble);
      cube.move(moves.join(" "));
      expect(crossSolved(cube)).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(8);
    }
  });

  it("finds a valid, <=8-move cross solution for many random scrambles", () => {
    for (let i = 0; i < 300; i++) {
      const scramble = randomAlg(20);
      const moves = solveCrossOptimal(scramble);
      const cube = new Cube();
      cube.move(scramble);
      cube.move(moves.join(" "));
      expect(crossSolved(cube)).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(8);
    }
  });
});
