import { describe, expect, it, beforeAll } from "vitest";
import { Cube } from "../cube-engine/engine";
import { buildTrainerState } from "./trainerState";

const CROSS_EDGES = [0, 1, 2, 3];
const F2L_CORNERS = [0, 1, 2, 3];
const F2L_EDGES = [8, 9, 10, 11];
const LL_CORNERS = [4, 5, 6, 7];
const LL_EDGES = [4, 5, 6, 7];

function firstTwoLayersSolved(cube: InstanceType<typeof Cube>): boolean {
  for (const s of CROSS_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  for (const s of F2L_CORNERS) if (cube.cp[s] !== s || cube.co[s] !== 0) return false;
  for (const s of F2L_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  return true;
}

function lastLayerOriented(cube: InstanceType<typeof Cube>): boolean {
  for (const s of LL_CORNERS) if (cube.co[s] !== 0) return false;
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return true;
}

function lastLayerEdgesOriented(cube: InstanceType<typeof Cube>): boolean {
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return true;
}

describe("buildTrainerState", () => {
  beforeAll(() => {
    Cube.initSolver();
  });

  it("oll mode: solves cross+F2L but leaves the last layer scrambled", () => {
    let sawUnsolvedLastLayer = false;
    for (let i = 0; i < 15; i++) {
      const { setupAlg } = buildTrainerState("oll");
      const cube = new Cube();
      cube.move(setupAlg);
      expect(firstTwoLayersSolved(cube)).toBe(true);
      if (!cube.isSolved()) sawUnsolvedLastLayer = true;
    }
    // Astronomically unlikely for 15 random scrambles to all happen to finish fully solved.
    expect(sawUnsolvedLastLayer).toBe(true);
  }, 30_000);

  it("pll mode: solves cross+F2L+orientation, leaving only permutation scrambled", () => {
    // Each iteration retries solveOLL (~20% per-attempt success rate, up to
    // MAX_ATTEMPTS) on fresh scrambles until one succeeds, so worst-case
    // total time has real variance run to run — give this a generous bound
    // rather than chase a moving target with a tight one.
    let sawUnsolvedPermutation = false;
    for (let i = 0; i < 6; i++) {
      const { setupAlg } = buildTrainerState("pll");
      const cube = new Cube();
      cube.move(setupAlg);
      expect(firstTwoLayersSolved(cube)).toBe(true);
      expect(lastLayerOriented(cube)).toBe(true);
      if (!cube.isSolved()) sawUnsolvedPermutation = true;
    }
    expect(sawUnsolvedPermutation).toBe(true);
  }, 180_000);

  it("zbll mode: solves cross+F2L+edge-orientation, leaving corner orientation and permutation scrambled", () => {
    let sawUnorientedCorners = false;
    let sawUnsolvedPermutation = false;
    for (let i = 0; i < 15; i++) {
      const { setupAlg } = buildTrainerState("zbll");
      const cube = new Cube();
      cube.move(setupAlg);
      expect(firstTwoLayersSolved(cube)).toBe(true);
      expect(lastLayerEdgesOriented(cube)).toBe(true);
      if (!lastLayerOriented(cube)) sawUnorientedCorners = true;
      if (!cube.isSolved()) sawUnsolvedPermutation = true;
    }
    // Astronomically unlikely for 15 random cases to all happen to have
    // corners already oriented, or to all land fully solved.
    expect(sawUnorientedCorners).toBe(true);
    expect(sawUnsolvedPermutation).toBe(true);
  }, 60_000);
});
