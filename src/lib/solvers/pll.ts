import type { CubeJSInstance } from "../cube-engine/engine";
import { idaStarSolve } from "./idaStar";
import { F2L_PAIRS, lastLayerHeuristic, pairHeuristic } from "./data/pieceTablesClient";
import { crossHeuristic } from "./cross";

export const LAST_LAYER_FACES = [1, 2, 3, 4, 5] as const; // R, F, D, L, B — no U

export function pllHeuristic(cube: CubeJSInstance): number {
  let h = Math.max(lastLayerHeuristic(cube), crossHeuristic(cube));
  for (const pair of F2L_PAIRS) {
    const ph = pairHeuristic(cube, pair);
    if (ph > h) h = ph;
  }
  return h;
}

const SEARCH_TIERS = [
  { maxDepth: 9, maxNodes: 250_000 },
  { maxDepth: 12, maxNodes: 2_000_000 },
];

/**
 * Permutes the (already-oriented) last layer into place, keeping cross and
 * F2L intact. This is the "PLL" step of CFOP. Mutates `cube` in place.
 * Throws if no solution is found within the search budget (the rare hard
 * case) — callers should have a fallback (see cfop.ts).
 */
export function solvePLL(cube: CubeJSInstance): string[] {
  let moves: string[] | null = null;
  for (const tier of SEARCH_TIERS) {
    moves = idaStarSolve(cube, {
      heuristic: pllHeuristic,
      isGoal: (c) => c.isSolved(),
      faces: LAST_LAYER_FACES,
      ...tier,
    });
    if (moves) break;
  }
  if (!moves) throw new Error("PLL solver failed");
  if (moves.length > 0) cube.move(moves.join(" "));
  return moves;
}
