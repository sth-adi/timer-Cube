import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { idaStarSolve } from "./idaStar";
import { solveCrossOptimal } from "./cross";
import { solveF2L, type F2LPairSolution } from "./f2l";
import { solveOLL } from "./oll";
import { solvePLL, LAST_LAYER_FACES, pllHeuristic } from "./pll";

export interface CFOPSolution {
  scramble: string;
  cross: string[];
  f2l: F2LPairSolution[];
  oll: string[];
  pll: string[];
  full: string[];
  totalMoves: number;
  /** True if the rare hard last-layer case fell back to a combined (non-method) solve. */
  lastLayerFallback: boolean;
  /**
   * True only in the extremely rare case where even the no-U-turn combined
   * last-layer search failed and the engine's fully unconstrained two-phase
   * solver was used — the one case that can touch the cross/F2L again.
   */
  lastLayerUnconstrained: boolean;
}

// A generous but still bounded budget for the single-shot combined last-layer
// fallback below. It has no OLL waypoint to hit, so it's a much easier search
// than sequential OLL-then-PLL and succeeds far more often within budget.
const COMBINED_LAST_LAYER_TIERS = [
  { maxDepth: 9, maxNodes: 300_000 },
  { maxDepth: 11, maxNodes: 1_000_000 },
];

/**
 * Solves the last layer (cross+F2L already solved) as separate OLL then PLL
 * stages. For the rare case where our from-scratch search can't find either
 * within its time budget, falls back to a single combined last-layer search
 * still restricted to the same no-U move set — so even when it can't be
 * cleanly split into OLL then PLL, it never re-disturbs the cross/F2L (no
 * "random" moves touching the already-solved layers). Only in the extremely
 * rare case that this restricted search also fails do we fall back to the
 * engine's fully unconstrained two-phase solver, as an absolute last resort
 * that's still always guaranteed to be correct.
 */
function solveLastLayerStaged(cube: CubeJSInstance): {
  oll: string[];
  pll: string[];
  fallback: boolean;
  unconstrained: boolean;
} {
  // Snapshot before attempting OLL: if OLL succeeds but PLL then fails, the
  // cube has already been mutated by OLL's moves, which aren't reflected in
  // the returned move list. Roll back to this snapshot before falling back
  // so the returned `full` move list always matches the cube's actual state.
  const preLastLayer = cube.clone();
  try {
    const oll = solveOLL(cube);
    const pll = solvePLL(cube);
    return { oll, pll, fallback: false, unconstrained: false };
  } catch {
    cube.init(preLastLayer);
    for (const tier of COMBINED_LAST_LAYER_TIERS) {
      const combined = idaStarSolve(cube, {
        heuristic: pllHeuristic,
        isGoal: (c) => c.isSolved(),
        faces: LAST_LAYER_FACES,
        ...tier,
      });
      if (combined) {
        if (combined.length > 0) cube.move(combined.join(" "));
        return { oll: [], pll: combined, fallback: true, unconstrained: false };
      }
    }
    cube.init(preLastLayer);
    const remaining = cube.solve().trim();
    if (remaining.length > 0) cube.move(remaining);
    const moves = remaining.length > 0 ? remaining.split(/\s+/) : [];
    return { oll: [], pll: moves, fallback: true, unconstrained: true };
  }
}

/**
 * Computes a full, genuinely method-based CFOP solution: an optimal white
 * cross, then the 4 F2L pairs solved cheapest-first (keeping the cross and
 * prior pairs intact), then OLL (orient last layer), then PLL (permute last
 * layer) as their own distinct stages. Every stage is verified against the
 * actual cube engine, so the result is guaranteed to solve the cube.
 */
export function solveCFOP(scramble: string): CFOPSolution {
  const cube = new Cube();
  cube.move(scramble);

  const cross = solveCrossOptimal(scramble);
  if (cross.length > 0) cube.move(cross.join(" "));

  const f2l = solveF2L(cube);
  const { oll, pll, fallback, unconstrained } = solveLastLayerStaged(cube);

  if (!cube.isSolved()) {
    throw new Error("CFOP solver produced an invalid solution (cube not solved)");
  }

  const full = [...cross, ...f2l.flatMap((p) => p.moves), ...oll, ...pll];

  return {
    scramble,
    cross,
    f2l,
    oll,
    pll,
    full,
    totalMoves: full.length,
    lastLayerFallback: fallback,
    lastLayerUnconstrained: unconstrained,
  };
}
