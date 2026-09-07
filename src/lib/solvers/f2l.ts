import type { CubeJSInstance } from "../cube-engine/engine";
import { idaStarSolve } from "./idaStar";
import { F2L_PAIRS, isPairSolved, pairHeuristic, type PairId } from "./data/pieceTablesClient";
import { crossHeuristic } from "./cross";

const CROSS_EDGES = [4, 5, 6, 7];
// F,R,L,B in face-index terms (U=0,R=1,F=2,D=3,L=4,B=5) — D excluded, matching
// real F2L technique (the bottom/cross layer is never turned again once solved).
const F2L_FACES = [0, 1, 2, 4, 5] as const; // U, R, F, L, B

function crossSolved(cube: CubeJSInstance): boolean {
  for (const slot of CROSS_EDGES) {
    if (cube.ep[slot] !== slot || cube.eo[slot] !== 0) return false;
  }
  return true;
}

export interface F2LPairSolution {
  pairName: string;
  moves: string[];
}

const PAIR_NAMES = ["FR", "FL", "BL", "BR"];

/**
 * Solves all 4 F2L pairs one at a time (cheapest/shortest remaining pair
 * first, like efficient human CFOP), keeping the cross and every
 * already-solved pair fixed. `cube` must already have the cross solved;
 * it is mutated in place to the fully F2L-solved state.
 */
// Tiered search budgets: most pairs solve instantly at the first tier; only
// the rare hard case (often the last pair, most constrained) needs to fall
// back to a deeper/bigger search.
const SEARCH_TIERS = [
  { maxDepth: 10, maxNodes: 1_500_000 },
  { maxDepth: 13, maxNodes: 10_000_000 },
];

export function solveF2L(cube: CubeJSInstance): F2LPairSolution[] {
  const solved: PairId[] = [];
  const remaining = [...F2L_PAIRS];
  const results: F2LPairSolution[] = [];

  while (remaining.length > 0) {
    // Pick the pair that looks cheapest right now (greedy, like a human scanning for the easiest pair).
    remaining.sort((a, b) => pairHeuristic(cube, a) - pairHeuristic(cube, b));
    const pair = remaining.shift()!;
    const pairIndex = F2L_PAIRS.indexOf(pair);

    const priorPairs = solved;
    const isGoal = (c: CubeJSInstance) =>
      crossSolved(c) && priorPairs.every((p) => isPairSolved(c, p)) && isPairSolved(c, pair);
    // Max of independent admissible lower bounds: the target pair's own
    // distance, the cross's (in case a move disturbed it), and each
    // already-solved prior pair's own distance (in case a move disturbed
    // one of those). This is what actually keeps later pairs tractable —
    // without it the search has no signal that it wandered off and wasted
    // moves breaking something already solved.
    const heuristic = (c: CubeJSInstance) => {
      let h = Math.max(pairHeuristic(c, pair), crossHeuristic(c));
      for (const p of priorPairs) {
        const ph = pairHeuristic(c, p);
        if (ph > h) h = ph;
      }
      return h;
    };

    let moves: string[] | null = null;
    for (const tier of SEARCH_TIERS) {
      moves = idaStarSolve(cube, { heuristic, isGoal, faces: F2L_FACES, ...tier });
      if (moves) break;
    }
    if (!moves) {
      throw new Error(`F2L solver failed to solve pair ${PAIR_NAMES[pairIndex]}`);
    }

    if (moves.length > 0) cube.move(moves.join(" "));
    solved.push(pair);
    results.push({ pairName: PAIR_NAMES[pairIndex], moves });
  }

  return results;
}
