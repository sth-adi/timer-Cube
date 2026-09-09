/**
 * Cheap, table-lookup-only features describing how hard a scramble actually
 * is — no search involved, so this runs in well under a millisecond and can
 * be computed for hundreds of historical scrambles without a worker. This is
 * what the predictive solve-time model trains and predicts on.
 */

import { Cube } from "../cube-engine/engine";
import { solveCrossOptimal } from "../solvers/cross";
import { F2L_PAIRS, pairHeuristic } from "../solvers/data/pieceTablesClient";

export interface ScrambleFeatures {
  /** Length of the provably optimal cross — 0 to 8 on any 3x3 scramble. */
  crossLen: number;
  /** Sum of each F2L pair's admissible lower bound once the cross is solved — a proxy for total F2L work. */
  f2lLowerBoundSum: number;
  /** The single hardest pair's lower bound — a proxy for the bottleneck pair. */
  f2lMaxLowerBound: number;
}

/** Feature order fed to the regression model — kept in one place so training and prediction can't drift apart. */
export function featureVector(f: ScrambleFeatures): number[] {
  return [f.crossLen, f.f2lLowerBoundSum, f.f2lMaxLowerBound];
}

export function computeScrambleFeatures(scramble: string): ScrambleFeatures {
  const cube = new Cube();
  cube.move(scramble);

  const cross = solveCrossOptimal(scramble);
  if (cross.length > 0) cube.move(cross.join(" "));

  let sum = 0;
  let max = 0;
  for (const pair of F2L_PAIRS) {
    const h = pairHeuristic(cube, pair);
    sum += h;
    if (h > max) max = h;
  }

  return { crossLen: cross.length, f2lLowerBoundSum: sum, f2lMaxLowerBound: max };
}
