import Cube, { type CubeJSInstance } from "./vendor/index.js";
import { loadPrecomputedSolverTables } from "./loadPrecomputedSolverTables";

/** Face indices, Kociemba convention. */
export const FACE = {
  U: 0,
  R: 1,
  F: 2,
  D: 3,
  L: 4,
  B: 5,
} as const;

/** Corner cubie indices, in solved position order. */
export const CORNER = {
  URF: 0,
  UFL: 1,
  ULB: 2,
  UBR: 3,
  DFR: 4,
  DLF: 5,
  DBL: 6,
  DRB: 7,
} as const;

/** Edge cubie indices, in solved position order. */
export const EDGE = {
  UR: 0,
  UF: 1,
  UL: 2,
  UB: 3,
  DR: 4,
  DF: 5,
  DL: 6,
  DB: 7,
  FR: 8,
  FL: 9,
  BL: 10,
  BR: 11,
} as const;

/**
 * The solver's cross lives on U — which is white in the fixed color scheme
 * the 3D viewer (cubing.js) renders, and the face its default camera shows
 * most prominently — so "white cross" in the UI actually shows a white
 * cross on screen. The last layer (OLL/PLL) is consequently solved on D.
 */
export const CROSS_EDGES = [EDGE.UR, EDGE.UF, EDGE.UL, EDGE.UB] as const;
export const LAST_LAYER_CORNERS = [
  CORNER.DFR,
  CORNER.DLF,
  CORNER.DBL,
  CORNER.DRB,
] as const;
export const LAST_LAYER_EDGES = [EDGE.DR, EDGE.DF, EDGE.DL, EDGE.DB] as const;

let solverReady = false;

/**
 * Builds the two-phase solver's move + pruning tables — ~2.5s and ~35MB of
 * heap from scratch (measured), so loadPrecomputedSolverTables() fetches a
 * precomputed static asset and populates everything it can from that first
 * (hence this being async); initSolver() then only computes whatever, if
 * anything, didn't load. Call once, off the main thread (this runs inside
 * cube-engine/worker.ts).
 */
export async function ensureSolverReady(): Promise<void> {
  if (solverReady) return;
  await loadPrecomputedSolverTables();
  Cube.initSolver();
  solverReady = true;
}

export function isSolverReady(): boolean {
  return solverReady;
}

export type MoveString = string;

/** A freshly solved cube instance. */
export function newCube(): CubeJSInstance {
  return new Cube();
}

/** Cube instance with `alg` applied on top of a solved cube. */
export function cubeFromAlg(alg: MoveString): CubeJSInstance {
  const c = new Cube();
  c.move(alg);
  return c;
}

/** Normalizes an alg string (collapses whitespace, trims). */
export function normalizeAlg(alg: MoveString): MoveString {
  return alg.trim().split(/\s+/).filter(Boolean).join(" ");
}

/** Generates a genuine WCA-legal random-*state* 3x3 scramble. Requires ensureSolverReady(). */
export function generateScramble333(): MoveString {
  return Cube.scramble();
}

/** Near-optimal (two-phase) full solution for the given scramble. Requires ensureSolverReady(). */
export function solveEfficient(scramble: MoveString, maxDepth = 24): MoveString {
  const c = cubeFromAlg(scramble);
  return c.solve(maxDepth);
}

export function isSolvedAlg(scramble: MoveString, solution: MoveString): boolean {
  const c = cubeFromAlg(scramble);
  c.move(solution);
  return c.isSolved();
}

/** Applies a single face turn (power: 0=CW, 1=180, 2=CCW) to a clone, returning the clone. */
export function applyFaceTurn(cube: CubeJSInstance, face: number, power: 0 | 1 | 2): CubeJSInstance {
  const child = cube.clone();
  for (let t = 0; t <= power; t++) child.multiply(Cube.moves[face]);
  return child;
}

export { Cube };
export type { CubeJSInstance };
