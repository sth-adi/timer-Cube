import Cube, { type CubeJSInstance } from "./vendor/index.js";

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
 * We follow standard competitive CFOP convention: the cross color lives on
 * D (bottom) for the whole solve, so the last layer (OLL/PLL) ends up on U
 * (top), matching how solvers actually hold the cube. "White cross" in the
 * UI simply means "the cross color", oriented to D during scrambling.
 */
export const CROSS_EDGES = [EDGE.DR, EDGE.DF, EDGE.DL, EDGE.DB] as const;
export const LAST_LAYER_CORNERS = [
  CORNER.URF,
  CORNER.UFL,
  CORNER.ULB,
  CORNER.UBR,
] as const;
export const LAST_LAYER_EDGES = [EDGE.UR, EDGE.UF, EDGE.UL, EDGE.UB] as const;

let solverReady = false;

/** Builds the two-phase solver's pruning tables. Expensive (~1-2s); call once, off the main thread. */
export function ensureSolverReady(): void {
  if (solverReady) return;
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
