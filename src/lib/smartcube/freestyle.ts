import { invertAlg } from "@/lib/algorithms/algUtils";
import { cubeFromAlg } from "@/lib/cube-engine/engine";

/**
 * Freestyle: scramble the cube any way you like. The cube already reports
 * exactly where every piece is, so the state you leave it in *is* the
 * scramble — its solution, run backwards, is a move sequence that takes a
 * solved cube there, and that's what gets timed, analysed and saved like
 * any generated scramble.
 */

/** How long the cube must sit untouched before the shuffle counts as finished. Past the cube-state check the store makes at 1.5s, so the state read is confirmed. */
export const FREESTYLE_STILL_MS = 2000;
/** Fewer turns than this since the last solve isn't a scramble, it's fiddling. */
export const FREESTYLE_MIN_TURNS = 8;
/**
 * A shuffle solvable in fewer moves than this is flagged as too easy to be a scramble. The solver
 * finds *exactly* optimal solutions only up to 6 moves (see computeCorrectiveMoves); anything
 * deeper comes back from the two-phase solver at ~15-22 moves whatever its real depth (an 8-move
 * shuffle reads as ~19), so solution length can tell "trivial" from "not" and nothing finer.
 * You can still go ahead with a flagged one.
 */
export const FREESTYLE_MIN_SOLUTION = 7;

/** The scramble that takes a solved cube to the state `solution` solves. */
export function scrambleFromSolution(solution: readonly string[]): string {
  return invertAlg(solution.join(" "));
}

/** True when `scramble`, run on a solved cube, gives exactly `facelets` — the check that the derived scramble is faithful before it's trusted. */
export function scrambleReproduces(scramble: string, facelets: string): boolean {
  return cubeFromAlg(scramble).asString() === facelets;
}

export type FreestyleVerdict =
  | { kind: "ok"; scramble: string }
  /** Mixed, but only a few moves from solved. */
  | { kind: "easy"; scramble: string; moves: number }
  /** The derived scramble doesn't rebuild the state (shouldn't happen — guarded rather than trusted). */
  | { kind: "invalid" };

/** Judges a finished shuffle given the solver's solution for its state. */
export function judgeShuffle(facelets: string, solution: readonly string[]): FreestyleVerdict {
  const scramble = scrambleFromSolution(solution);
  if (!scrambleReproduces(scramble, facelets)) return { kind: "invalid" };
  if (solution.length < FREESTYLE_MIN_SOLUTION) return { kind: "easy", scramble, moves: solution.length };
  return { kind: "ok", scramble };
}
