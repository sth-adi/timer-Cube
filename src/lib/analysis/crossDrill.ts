/**
 * Grading for the cross drill: you plan a cross during inspection, type what
 * you planned, and this says whether it works and how it compares to the
 * shortest one available.
 *
 * The comparison is exact rather than approximate — the cross solver walks a
 * complete pruning table, so "6 moves was available" is a fact, not an
 * estimate. That's what makes the drill worth doing: a near-miss is measurable.
 */

import { Cube } from "../cube-engine/engine";
import { solveCrossOptimal } from "../solvers/cross";
import { countMoves, movesToAlg, parseMoves } from "./notation";
import { mapFromSolverFrame, mapToSolverFrame, relabelAlg, relabelMoves, type Face } from "./frames";
import { crossSolvedOn } from "./segment";

export interface CrossDrillInput {
  scramble: string;
  attempt: string;
  /**
   * The face the cross is being built on, in the cuber's own grip. Almost
   * everyone holds white on the bottom, so their moves are written in a frame
   * rotated from the one the scramble was applied in.
   */
  crossFace: Face;
}

export interface CrossDrillResult {
  ok: true;
  /** Whether the attempt actually leaves the cross solved. */
  solved: boolean;
  /** Turns the attempt used (STM — rotations are free). */
  moveCount: number;
  /** Turns the shortest cross needs. Always 8 or fewer on a 3x3. */
  optimalCount: number;
  /** The shortest cross, written in the cuber's own frame so it can be copied straight onto a cube. */
  optimalMoves: string[];
  /** True when the attempt matched the shortest available. */
  optimal: boolean;
}

export interface CrossDrillFailure {
  ok: false;
  errors: string[];
}

export type CrossDrillOutcome = CrossDrillResult | CrossDrillFailure;

export function gradeCrossAttempt(input: CrossDrillInput): CrossDrillOutcome {
  const scrambleParse = parseMoves(input.scramble);
  if (scrambleParse.errors.length) return { ok: false, errors: scrambleParse.errors };
  if (scrambleParse.moves.length === 0) return { ok: false, errors: ["No scramble to solve."] };

  const attemptParse = parseMoves(input.attempt);
  if (attemptParse.errors.length) return { ok: false, errors: attemptParse.errors };

  const toSolver = mapToSolverFrame(input.crossFace);
  const fromSolver = mapFromSolverFrame(input.crossFace);

  // The scramble was applied in the standard orientation; only the attempt is
  // written in the cuber's rotated grip, so only the attempt is relabeled.
  const scrambleAlg = movesToAlg(scrambleParse.moves);
  const attemptAlg = movesToAlg(relabelMoves(attemptParse.moves, toSolver));

  const cube = new Cube();
  cube.move(scrambleAlg);
  if (attemptAlg) cube.move(attemptAlg);

  const optimalMoves = solveCrossOptimal(scrambleAlg).map((m) => relabelAlg(m, fromSolver));
  const moveCount = countMoves(attemptParse.moves).stm;

  return {
    ok: true,
    solved: crossSolvedOn(cube, "U"),
    moveCount,
    optimalCount: optimalMoves.length,
    optimalMoves,
    optimal: crossSolvedOn(cube, "U") && moveCount === optimalMoves.length,
  };
}
