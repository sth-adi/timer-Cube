/**
 * Live scramble verification for a Bluetooth smart cube: is the physical
 * cube actually in the state the target scramble produces, and if not,
 * exactly what moves get it there from here.
 */

import { Cube, cubeFromAlg, normalizeAlg, type CubeJSInstance } from "../cube-engine/engine";
import { invertAlg } from "../algorithms/algUtils";
import { idaStarSolve } from "../solvers/idaStar";

const ALL_FACES = [0, 1, 2, 3, 4, 5];
/** Covers the overwhelming majority of real "went off the scramble" mistakes with a genuinely optimal answer. */
const OPTIMAL_CORRECTION_DEPTH = 6;

/** The scramble's resulting facelets — what the live cube should read once scrambling is done correctly. */
export function targetFacelets(scramble: string): string {
  return cubeFromAlg(scramble).asString();
}

/** True once the live cube's reported state matches the target scramble exactly. */
export function isScrambleComplete(liveFacelets: string, scramble: string): boolean {
  return liveFacelets === targetFacelets(scramble);
}

/** Exact identity check (every piece home, correctly oriented) — not the "solved up to a whole-cube rotation" check `Cube.isSolved()` does, since a pure alg-composition delta has no such ambiguity to tolerate. */
function isIdentity(cube: CubeJSInstance): boolean {
  for (let i = 0; i < 8; i++) if (cube.cp[i] !== i || cube.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (cube.ep[i] !== i || cube.eo[i] !== 0) return false;
  return true;
}

/**
 * The shortest move sequence that takes the cube from wherever it actually
 * is right now to the target scramble's result — i.e. what to do next to
 * get back on track, however far off the scramble went.
 *
 * `actualFacelets` is the live cube's current state (see smartCubeStore's
 * `liveFacelets`), not a move log — a delta cube is built as
 * `invert(scramble) . actualState`, and *solving* that delta (bringing it
 * back to identity) yields exactly the moves needed. See
 * scrambleVerify.test.ts for the worked derivation this relies on.
 *
 * Requires ensureSolverReady() — expensive (~1-2s) two-phase solver tables,
 * so this always runs on the cube-engine worker, never the main thread.
 */
export function computeCorrectiveMoves(scramble: string, actualFacelets: string, maxDepth = 22): string[] {
  const delta = new Cube();
  const inverted = invertAlg(scramble);
  if (inverted) delta.move(inverted);
  delta.multiply(Cube.fromString(actualFacelets));

  if (isIdentity(delta)) return [];

  // Most real scramble mistakes are only a handful of moves off — an exact,
  // unbounded-heuristic IDA* up to a small depth finds a genuinely optimal
  // correction for those near-instantly, which matters for something shown
  // live while the cuber is mid-scramble.
  const optimal = idaStarSolve(delta, {
    heuristic: () => 0,
    isGoal: isIdentity,
    faces: ALL_FACES,
    maxDepth: OPTIMAL_CORRECTION_DEPTH,
    maxNodes: 3_000_000,
  });
  if (optimal) return optimal;

  // Only reached when the mistake was big enough that no short correction
  // exists — the near-optimal two-phase solver always succeeds here, just
  // not always minimally.
  const solution = normalizeAlg(delta.solve(maxDepth));
  return solution ? solution.split(" ") : [];
}
