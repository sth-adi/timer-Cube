import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { solveCrossOptimal } from "./cross";
import { solveF2L, type F2LPairSolution } from "./f2l";
import { solveOLL } from "./oll";
import { solvePLL } from "./pll";

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
}

/**
 * Solves the last layer (cross+F2L already solved) as separate OLL then PLL
 * stages. For the rare case where our from-scratch search can't find either
 * within its time budget, falls back to the engine's own near-optimal
 * two-phase solver for whatever remains — still always correct, just
 * presented as one combined step instead of two.
 */
function solveLastLayerStaged(cube: CubeJSInstance): {
  oll: string[];
  pll: string[];
  fallback: boolean;
} {
  // Snapshot before attempting OLL: if OLL succeeds but PLL then fails, the
  // cube has already been mutated by OLL's moves, which aren't reflected in
  // the returned move list. Roll back to this snapshot before falling back
  // so the returned `full` move list always matches the cube's actual state.
  const preLastLayer = cube.clone();
  try {
    const oll = solveOLL(cube);
    const pll = solvePLL(cube);
    return { oll, pll, fallback: false };
  } catch {
    cube.init(preLastLayer);
    const remaining = cube.solve().trim();
    if (remaining.length > 0) cube.move(remaining);
    const moves = remaining.length > 0 ? remaining.split(/\s+/) : [];
    return { oll: [], pll: moves, fallback: true };
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
  const { oll, pll, fallback } = solveLastLayerStaged(cube);

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
  };
}
