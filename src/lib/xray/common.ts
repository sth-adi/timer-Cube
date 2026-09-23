import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CUBE_ORIENTATIONS, apply, viewerMove, type Mat3 } from "@/lib/gyro/orientation";

/**
 * Shared plumbing for the Solve X-Ray analyses. Everything here works in
 * the engine's frame — cross on the white U face, last layer on yellow D,
 * moves named by physical center color exactly as a smart cube reports
 * them — and converts to the solver's own frame (yellow on top) only for
 * display.
 */

/** A recorded smart-cube solve, as the X-Ray analyses need it. */
export interface XraySolveInput {
  scramble: string;
  /** Physical move tokens, one per move. */
  moves: readonly string[];
  /** Ms from solve start for each move. */
  timesMs: readonly number[];
}

/** F2L pairs by engine index (URF/FR, UFL/FL, ULB/BL, UBR/BR), named by their colors since a slot's position depends on how the cube is held. */
export const PAIR_LABELS = ["Green-Red", "Green-Orange", "Blue-Orange", "Blue-Red"] as const;
/** The two sticker colors of each pair, for drawing. */
export const PAIR_COLORS: readonly [string, string][] = [
  ["#1faa4d", "#e0302b"],
  ["#1faa4d", "#ff8a1f"],
  ["#2f6fe4", "#ff8a1f"],
  ["#2f6fe4", "#e0302b"],
];

/** The cube state after every move (index i = after moves[i]), plus the scrambled start. */
export function replayStates(scramble: string, moves: readonly string[]): { start: CubeJSInstance; after: CubeJSInstance[] } {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const start = cube.clone();
  const after: CubeJSInstance[] = [];
  for (const m of moves) {
    cube.move(m);
    after.push(cube.clone());
  }
  return { start, after };
}

const CROSS_EDGES = [0, 1, 2, 3];

export function crossSolved(cube: CubeJSInstance): boolean {
  return CROSS_EDGES.every((s) => cube.ep[s] === s && cube.eo[s] === 0);
}

function findOrientation(pred: (m: Mat3) => boolean): Mat3 {
  const found = CUBE_ORIENTATIONS.find(pred);
  if (!found) throw new Error("no cube orientation satisfies the constraint");
  return found;
}

const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/** Body-frame position of each F2L pair's corner (engine frame: white U on top). */
const PAIR_CORNER_VECTORS: [number, number, number][] = [
  [1, 1, 1],
  [-1, 1, 1],
  [-1, 1, -1],
  [1, 1, -1],
];

/**
 * The grip a cuber would use to insert a given pair: yellow on top, the
 * pair's slot at front-right. Moves re-expressed through this read the
 * way F2L is always written ("U R U' R'"), whichever slot it was.
 */
export function slotGrip(pairIndex: number): Mat3 {
  return findOrientation((m) => near(apply(m, [0, -1, 0]), [0, 1, 0]) && near(apply(m, PAIR_CORNER_VECTORS[pairIndex]), [1, -1, 1]));
}

/** Yellow-top grips, one per y-rotation (k = 0..3), for normalising last-layer algorithms. */
export const YELLOW_TOP_GRIPS: readonly Mat3[] = [0, 1, 2, 3].map((k) => slotGrip(k));

/** Re-expresses engine-frame moves in a given grip. */
export function inGrip(moves: readonly string[], grip: Mat3): string[] {
  return moves.map((m) => viewerMove(m, grip));
}

/** A grip that puts the given face's color on top (any front). */
export function colorOnTopGrip(face: string): Mat3 {
  const normals: Record<string, [number, number, number]> = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    R: [1, 0, 0],
    L: [-1, 0, 0],
    F: [0, 0, 1],
    B: [0, 0, -1],
  };
  return findOrientation((m) => near(apply(m, normals[face]), [0, 1, 0]));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Inverse of a move sequence. */
export function invertMoves(moves: readonly string[]): string[] {
  return [...moves].reverse().map((t) => (t.endsWith("'") ? t[0] : t.endsWith("2") ? t : `${t}'`));
}
