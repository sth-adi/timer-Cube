/**
 * Names the last-layer case a solve actually had.
 *
 * Recognition is done on cube state, not on the moves the cuber executed, so
 * it still works when they used a non-standard algorithm, a mirror, a 2-look
 * pair, or a different AUF than the book alg assumes. Every case in the
 * library is expanded into its AUF-equivalent states once, and the user's
 * state is looked up in that index.
 */

import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { OLL_CASES } from "../algorithms/ollData";
import { PLL_CASES } from "../algorithms/pllData";
import { invertAlg } from "../algorithms/algUtils";
import type { AlgCase } from "../algorithms/types";

/**
 * The algorithm library uses the traditional convention with the last layer on
 * U, which is what every published OLL/PLL algorithm assumes. Indices here are
 * therefore U-layer indices, the mirror image of the solver frame's.
 */
const LL_CORNERS = [0, 1, 2, 3];
const LL_EDGES = [0, 1, 2, 3];

const AUF = ["", "U", "U2", "U'"] as const;

export interface CaseMatch {
  case: AlgCase;
  /** Move count of the library's algorithm for this case. */
  algMoves: number;
}

function orientationKey(cube: CubeJSInstance): string {
  return [...LL_CORNERS.map((s) => cube.co[s]), ...LL_EDGES.map((s) => cube.eo[s])].join(",");
}

function permutationKey(cube: CubeJSInstance): string {
  return [...LL_CORNERS.map((s) => cube.cp[s]), ...LL_EDGES.map((s) => cube.ep[s])].join(",");
}

function stateFor(alg: string): CubeJSInstance {
  const cube = new Cube();
  if (alg.trim()) cube.move(alg);
  return cube;
}

/**
 * OLL cares only about which way up the last layer's pieces are, so two states
 * are the same case when their orientation patterns differ by an AUF — a
 * trailing U turn, which just cycles which slot each piece sits in.
 */
function buildOllIndex(): Map<string, AlgCase> {
  const index = new Map<string, AlgCase>();
  for (const c of OLL_CASES) {
    const setup = invertAlg(c.alg);
    for (const auf of AUF) {
      const key = orientationKey(stateFor(`${setup} ${auf}`));
      if (!index.has(key)) index.set(key, c);
    }
  }
  return index;
}

/**
 * PLL is recognized up to an AUF on *both* sides: the cuber can turn the U
 * layer before the algorithm to line the case up, and again afterwards to
 * finish. If the book algorithm A solves case state S, then the states a cuber
 * can face and still call it that case are exactly U^a · S · U^b.
 */
function buildPllIndex(): Map<string, AlgCase> {
  const index = new Map<string, AlgCase>();
  for (const c of PLL_CASES) {
    const setup = invertAlg(c.alg);
    for (const before of AUF) {
      for (const after of AUF) {
        const key = permutationKey(stateFor(`${before} ${setup} ${after}`));
        if (!index.has(key)) index.set(key, c);
      }
    }
  }
  return index;
}

let ollIndex: Map<string, AlgCase> | null = null;
let pllIndex: Map<string, AlgCase> | null = null;

function countMoves(alg: string): number {
  return alg.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Identifies the OLL case for a state in the library frame (first two layers
 * solved on D, last layer on U and not yet oriented). Returns null for a
 * state already oriented (an OLL skip) or one the library doesn't contain.
 */
export function recognizeOll(cube: CubeJSInstance): CaseMatch | null {
  if (!ollIndex) ollIndex = buildOllIndex();
  const match = ollIndex.get(orientationKey(cube));
  if (!match) return null;
  return { case: match, algMoves: countMoves(match.alg) };
}

/**
 * Identifies the PLL case for a state in the library frame with the last layer
 * already oriented. Returns null for an already-permuted layer (a PLL skip) or
 * a state the library doesn't contain.
 */
export function recognizePll(cube: CubeJSInstance): CaseMatch | null {
  if (!pllIndex) pllIndex = buildPllIndex();
  const match = pllIndex.get(permutationKey(cube));
  if (!match) return null;
  return { case: match, algMoves: countMoves(match.alg) };
}

/** True when the last layer is already oriented — i.e. the OLL was skipped. */
export function isOllSkip(cube: CubeJSInstance): boolean {
  return LL_CORNERS.every((s) => cube.co[s] === 0) && LL_EDGES.every((s) => cube.eo[s] === 0);
}

/**
 * True when the last layer is already permuted up to an AUF — i.e. the PLL was
 * skipped. Checked modulo AUF because finishing with a single U turn is a
 * skip, not a PLL.
 */
export function isPllSkip(cube: CubeJSInstance): boolean {
  for (const auf of AUF) {
    const clone = cube.clone();
    if (auf) clone.move(auf);
    if (clone.isSolved()) return true;
  }
  return false;
}
