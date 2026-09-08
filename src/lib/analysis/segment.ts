/**
 * Splits a reconstruction into CFOP phases by watching the cube itself.
 *
 * Nothing here pattern-matches on move text: a phase ends at the first state
 * where everything finished so far is complete *and* one more milestone has
 * been added. That definition costs nothing in accuracy and buys a lot of
 * robustness — it handles skips (a zero-move phase), 2-look OLL/PLL, keyhole
 * and multi-slotting, and mid-solve cube rotations, none of which a text-based
 * splitter survives.
 *
 * The reason boundaries are cumulative rather than "first time this pair is
 * solved" is that pairs genuinely wobble mid-solve: inserting the third pair
 * can momentarily complete the fourth slot and break the first. A milestone
 * only counts when nothing already claimed is broken at that same instant.
 */

import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { F2L_PAIRS, isPairSolved } from "../solvers/data/pieceTablesClient";
import type { Move } from "./notation";
import { FACES, type Face } from "./frames";

/** Edge cubies carrying each face's colour, in Kociemba edge ids. */
const FACE_CROSS_EDGES: Record<Face, readonly number[]> = {
  U: [0, 1, 2, 3], // UR UF UL UB
  D: [4, 5, 6, 7], // DR DF DL DB
  F: [1, 5, 8, 9], // UF DF FR FL
  B: [3, 7, 10, 11], // UB DB BL BR
  R: [0, 4, 8, 11], // UR DR FR BR
  L: [2, 6, 9, 10], // UL DL FL BL
};

/** In the solver frame the cross is on U, so the last layer is D. */
const LL_CORNERS = [4, 5, 6, 7];
const LL_EDGES = [4, 5, 6, 7];

/** Human-facing slot names, parallel to F2L_PAIRS, in the solver frame. */
export const SOLVER_PAIR_NAMES = ["FR", "FL", "BL", "BR"] as const;

/**
 * Cube states after the scramble (index 0) and after each reconstruction move,
 * each canonicalized so that centres sit home — which is what makes every
 * predicate below immune to cube rotations inside the solve.
 */
export function walkStates(scramble: string, moves: readonly Move[]): CubeJSInstance[] {
  const cube = new Cube();
  if (scramble.trim()) cube.move(scramble);

  const states: CubeJSInstance[] = [canonicalize(cube)];
  for (const move of moves) {
    cube.move(move.token);
    states.push(canonicalize(cube));
  }
  return states;
}

function canonicalize(cube: CubeJSInstance): CubeJSInstance {
  const clone = cube.clone();
  const upright = clone.upright();
  if (upright) clone.move(upright);
  return clone;
}

export function crossSolvedOn(cube: CubeJSInstance, face: Face): boolean {
  for (const e of FACE_CROSS_EDGES[face]) {
    if (cube.ep[e] !== e || cube.eo[e] !== 0) return false;
  }
  return true;
}

export function lastLayerOriented(cube: CubeJSInstance): boolean {
  for (const s of LL_CORNERS) if (cube.co[s] !== 0) return false;
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return true;
}

/**
 * Which face the cuber built their cross on. Every face's cross is solved by
 * the end, so the tell is *how long* each one stood: the cross face is
 * complete for most of the solve, while a side face only comes together in the
 * last layer. Counting states rather than looking for the earliest completion
 * shrugs off both a lucky cross that the scramble half-built and a cross edge
 * that pops out during an F2L insertion.
 */
const TIE_BREAK_ORDER: readonly Face[] = ["D", "U", "F", "L", "R", "B"];

export function detectCrossFace(states: readonly CubeJSInstance[]): Face | null {
  if (states.length === 0) return null;
  let best: { face: Face; solvedStates: number; firstAt: number } | null = null;

  for (const face of FACES) {
    let solvedStates = 0;
    let firstAt = states.length;
    for (let i = 0; i < states.length; i++) {
      if (crossSolvedOn(states[i], face)) {
        solvedStates++;
        if (firstAt === states.length) firstAt = i;
      }
    }
    if (solvedStates === 0) continue;
    const candidate = { face, solvedStates, firstAt };
    if (
      !best ||
      candidate.solvedStates > best.solvedStates ||
      (candidate.solvedStates === best.solvedStates && candidate.firstAt < best.firstAt) ||
      (candidate.solvedStates === best.solvedStates &&
        candidate.firstAt === best.firstAt &&
        TIE_BREAK_ORDER.indexOf(face) < TIE_BREAK_ORDER.indexOf(best.face))
    ) {
      best = candidate;
    }
  }
  return best?.face ?? null;
}

export type PhaseId = "cross" | "f2l" | "oll" | "pll";

export interface Segment {
  phase: PhaseId;
  /** Display label: "Cross", "F2L 1", "OLL", "PLL". */
  label: string;
  /** Slot name for F2L segments, in the solver frame. */
  slot?: string;
  /** Index into the move list where this segment starts (inclusive). */
  start: number;
  /** Index where it ends (exclusive). */
  end: number;
}

export interface Segmentation {
  segments: Segment[];
  /**
   * False when the solve doesn't have CFOP's shape — cross, then four slots,
   * then orientation, then permutation. Roux, ZZ, Petrus and partial
   * reconstructions land here, and we report totals only rather than inventing
   * F2L pairs that were never solved as pairs.
   */
  cfopShaped: boolean;
  reason?: string;
}

/**
 * Segments a reconstruction already relabeled into the solver frame (cross on
 * U). `states` must come from `walkStates` over the same move list.
 */
export function segmentSolve(states: readonly CubeJSInstance[]): Segmentation {
  const moveCount = states.length - 1;
  const notCfop = (reason: string): Segmentation => ({ segments: [], cfopShaped: false, reason });

  const crossOf = (c: CubeJSInstance) => crossSolvedOn(c, "U");

  const crossEnd = states.findIndex(crossOf);
  if (crossEnd === -1) return notCfop("The cross is never finished in this solve.");

  // Walk forward claiming one slot at a time. A slot is only claimed at a state
  // where the cross and every previously claimed slot are intact too, so a
  // momentary alignment during someone else's insertion doesn't steal a
  // boundary from the pair that was actually being built.
  const claimed: number[] = [];
  const boundaries: { pairIndex: number; at: number }[] = [];
  let cursor = crossEnd;

  while (claimed.length < F2L_PAIRS.length) {
    let found: { pairIndex: number; at: number } | null = null;
    for (let i = cursor; i < states.length && !found; i++) {
      const state = states[i];
      if (!crossOf(state)) continue;
      if (!claimed.every((p) => isPairSolved(state, F2L_PAIRS[p]))) continue;
      for (let p = 0; p < F2L_PAIRS.length; p++) {
        if (claimed.includes(p)) continue;
        if (isPairSolved(state, F2L_PAIRS[p])) {
          found = { pairIndex: p, at: i };
          break;
        }
      }
    }
    if (!found) return notCfop("Not all four F2L slots end up solved together.");
    claimed.push(found.pairIndex);
    boundaries.push(found);
    cursor = found.at;
  }

  const f2lEnd = cursor;
  let ollEnd = -1;
  for (let i = f2lEnd; i < states.length; i++) {
    const state = states[i];
    if (crossOf(state) && F2L_PAIRS.every((p) => isPairSolved(state, p)) && lastLayerOriented(state)) {
      ollEnd = i;
      break;
    }
  }
  if (ollEnd === -1) return notCfop("The last layer is never oriented with the first two layers intact.");

  if (!states[states.length - 1].isSolved()) {
    return notCfop("The reconstruction doesn't finish with a solved cube.");
  }

  const segments: Segment[] = [{ phase: "cross", label: "Cross", start: 0, end: crossEnd }];
  let prev = crossEnd;
  boundaries.forEach((b, i) => {
    segments.push({
      phase: "f2l",
      label: `F2L ${i + 1}`,
      slot: SOLVER_PAIR_NAMES[b.pairIndex],
      start: prev,
      end: b.at,
    });
    prev = b.at;
  });

  segments.push({ phase: "oll", label: "OLL", start: f2lEnd, end: ollEnd });
  segments.push({ phase: "pll", label: "PLL", start: ollEnd, end: moveCount });

  return { segments, cfopShaped: true };
}
