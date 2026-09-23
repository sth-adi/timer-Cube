import { Cube, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { F2L_PAIRS, pairHeuristic } from "@/lib/solvers/data/pieceTablesClient";
import { moveLabel } from "@/lib/solvers/moveNotation";
import { PAIR_LABELS, crossSolved } from "@/lib/xray/common";
import { simplify } from "@/lib/smartcube/route";
import { solvedPair } from "@/lib/blindcross/grade";

/**
 * X-Cross Hunter's engine: the shortest x-cross (cross plus one chosen F2L
 * pair) from a scrambled cube, by IDA* over all 18 face turns. Both
 * lookups are exact on their own, so max(cross, pair) is a tight
 * admissible bound and a depth-8 search is a few thousand nodes.
 */

export interface XCrossSolution {
  pair: number;
  label: string;
  moves: string[];
}

// Faces are indexed as the engine's Cube.moves: U R F D L B. Opposite faces
// commute, so only one order of an opposite pair is searched.
const OPPOSITE = [3, 4, 5, 0, 1, 2];

function h(cube: CubeJSInstance, pair: number): number {
  return Math.max(crossHeuristic(cube), pairHeuristic(cube, F2L_PAIRS[pair]));
}

/** Shortest x-cross for one pair from `start`, or null if it needs more than `maxDepth` turns. */
export function solveXCross(start: CubeJSInstance, pair: number, maxDepth = 8): string[] | null {
  const path: string[] = [];
  const dfs = (cube: CubeJSInstance, depth: number, lastFace: number): boolean => {
    const est = h(cube, pair);
    if (est === 0) return true;
    if (est > depth) return false;
    for (let face = 0; face < 6; face++) {
      if (face === lastFace) continue;
      if (lastFace >= 0 && OPPOSITE[lastFace] === face && face < lastFace) continue;
      const child = cube.clone();
      for (let power = 0; power < 3; power++) {
        child.multiply(Cube.moves[face]);
        path.push(moveLabel(face, power as 0 | 1 | 2));
        if (dfs(child, depth - 1, face)) return true;
        path.pop();
      }
    }
    return false;
  };
  for (let depth = h(start, pair); depth <= maxDepth; depth++) {
    if (dfs(start.clone(), depth, -1)) return [...path];
  }
  return null;
}

/** Every pair's shortest x-cross within `maxDepth` (missing pairs need more), shortest first. */
export function xcrossOptions(scramble: string, maxDepth = 8): XCrossSolution[] {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const out: XCrossSolution[] = [];
  for (let pair = 0; pair < 4; pair++) {
    const moves = solveXCross(cube, pair, maxDepth);
    if (moves) out.push({ pair, label: PAIR_LABELS[pair], moves });
  }
  return out.sort((a, b) => a.moves.length - b.moves.length);
}

export interface XCrossGrade {
  /** Cross and a pair came out together — the x-cross was planned, not stumbled into afterwards. */
  hit: boolean;
  /** Your turns (same-face turns merged) until the cross and a pair were both in, or null if never. */
  turns: number | null;
  /** The pair that went in with the cross, if any. */
  pair: string | null;
  best: XCrossSolution | null;
  moves: string[];
  verdict: string;
  detail: string;
}

/** Grades an attempt against the options computed for its scramble. */
export function gradeXCross(scramble: string, rawMoves: readonly string[], options: readonly XCrossSolution[]): XCrossGrade {
  const moves = simplify(rawMoves);
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  let crossPair: number | null | undefined;
  let turns: number | null = null;
  let donePair: number | null = null;
  for (let i = 0; i < moves.length; i++) {
    cube.move(moves[i]);
    if (!crossSolved(cube)) continue;
    const p = solvedPair(cube);
    if (crossPair === undefined) crossPair = p;
    if (p !== null) {
      turns = i + 1;
      donePair = p;
      break;
    }
  }
  const best = options[0] ?? null;
  const hit = crossPair !== undefined && crossPair !== null;
  const mine = options.find((o) => o.pair === donePair);
  let verdict: string;
  let detail: string;
  if (hit && turns !== null) {
    verdict = best && turns <= best.moves.length ? "Optimal x-cross!" : `X-cross in ${turns} turns${best ? ` (best ${best.moves.length})` : ""}.`;
    detail =
      best && mine && mine.pair !== best.pair && mine.moves.length > best.moves.length
        ? `You went for ${mine.label} (${mine.moves.length} at best); ${best.label} was ${best.moves.length}.`
        : `Planned in inspection and executed in one go — ${PAIR_LABELS[donePair!]} went in with the cross.`;
  } else if (crossPair === undefined) {
    verdict = "The cross didn't get finished.";
    detail = best ? `The ${best.label} x-cross was ${best.moves.length} turns.` : "";
  } else {
    verdict = "Cross first, pair after — not an x-cross.";
    detail = best ? `The ${best.label} x-cross was there in ${best.moves.length} turns.` : "";
  }
  return { hit, turns, pair: donePair !== null ? PAIR_LABELS[donePair] : null, best, moves, verdict, detail };
}
