import type { CubeJSInstance } from "@/lib/cube-engine/engine";
import { F2L_PAIRS, pairHeuristic } from "@/lib/solvers/data/pieceTablesClient";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { PAIR_LABELS, crossSolved, mean, replayStates, type XraySolveInput } from "@/lib/xray/common";

/**
 * F2L Blind Spots. Every F2L pair you solve starts from somewhere: corner
 * and edge both up in the last layer, one of them stuck in another slot,
 * one sitting in its own slot the wrong way round. Replaying every smart-
 * cube solve you've done, this files each pair under where its two pieces
 * were the moment you started looking for it — and how long it took to
 * *find* (the pause before your first turn on it) versus *execute*.
 *
 * The result is a map of your lookahead's blind spots: not "F2L is slow"
 * but "pairs with the edge stuck in another slot cost you a full second
 * more to find than anything else".
 *
 * Engine frame: cross on U, so F2L slots are the U-layer corners and the
 * E-slice edges; the last layer ("up top" when you hold the cube) is D.
 */

export type Spot = "top" | "slot" | "home";
export const SPOTS: readonly Spot[] = ["top", "slot", "home"];

export const CORNER_SPOT_LABEL: Record<Spot, string> = {
  top: "Corner up top",
  slot: "Corner in another slot",
  home: "Corner twisted in its slot",
};
export const EDGE_SPOT_LABEL: Record<Spot, string> = {
  top: "edge up top",
  slot: "edge in another slot",
  home: "edge flipped in its slot",
};

export interface PairSegment {
  pair: number;
  /** 1-4: which pair of the solve this was. */
  order: number;
  corner: Spot;
  edge: Spot;
  /** Fewest turns that pair alone needed when you started on it. */
  distance: number;
  /** The pause before the first turn on this pair. */
  findMs: number;
  /** From that first turn to the pair being in. */
  execMs: number;
  totalMs: number;
  turns: number;
}

function cornerSpot(cube: CubeJSInstance, pair: number): Spot {
  const at = cube.cp.indexOf(F2L_PAIRS[pair].corner);
  return at >= 4 ? "top" : at === F2L_PAIRS[pair].corner ? "home" : "slot";
}

function edgeSpot(cube: CubeJSInstance, pair: number): Spot {
  const at = cube.ep.indexOf(F2L_PAIRS[pair].edge);
  return at >= 4 && at <= 7 ? "top" : at === F2L_PAIRS[pair].edge ? "home" : "slot";
}

const solvedPairs = (cube: CubeJSInstance) => [0, 1, 2, 3].filter((i) => f2lPairSolved(cube, i as 0 | 1 | 2 | 3));

/** One solve's F2L, pair by pair. Pairs that went in together (multislotting) or were solved before the cross are skipped. */
export function pairSegments({ scramble, moves, timesMs }: XraySolveInput): PairSegment[] {
  if (moves.length === 0 || timesMs.length !== moves.length) return [];
  const { after } = replayStates(scramble, moves);
  const crossIdx = after.findIndex((c) => crossSolved(c));
  if (crossIdx < 0) return [];

  const segments: PairSegment[] = [];
  let prevIdx = crossIdx;
  let prevSolved = solvedPairs(after[crossIdx]);
  let best = prevSolved.length;
  let order = best;
  for (let i = crossIdx + 1; i < after.length; i++) {
    if (!crossSolved(after[i])) continue;
    const now = solvedPairs(after[i]);
    if (now.length <= best) continue;
    const fresh = now.filter((p) => !prevSolved.includes(p));
    order += now.length - best;
    if (fresh.length === 1 && prevIdx + 1 <= i) {
      const pair = fresh[0];
      const start = after[prevIdx];
      const findMs = timesMs[prevIdx + 1] - timesMs[prevIdx];
      const totalMs = timesMs[i] - timesMs[prevIdx];
      segments.push({
        pair,
        order,
        corner: cornerSpot(start, pair),
        edge: edgeSpot(start, pair),
        distance: pairHeuristic(start, F2L_PAIRS[pair]),
        findMs,
        execMs: totalMs - findMs,
        totalMs,
        turns: i - prevIdx,
      });
    }
    best = now.length;
    prevIdx = i;
    prevSolved = now;
    if (best === 4) break;
  }
  return segments;
}

export type Metric = "totalMs" | "findMs" | "execMs";

export interface SpotCell {
  corner: Spot;
  edge: Spot;
  count: number;
  totalMs: number | null;
  findMs: number | null;
  execMs: number | null;
}

export interface BlindSpotInsight {
  label: string;
  metric: Metric;
  ms: number;
  baselineMs: number;
  count: number;
}

export interface BlindSpotReport {
  pairs: number;
  solves: number;
  overall: { totalMs: number; findMs: number; execMs: number };
  cells: SpotCell[];
  byPair: { label: string; count: number; totalMs: number | null }[];
  byOrder: { order: number; count: number; findMs: number | null; totalMs: number | null }[];
  /** Situations that cost the most relative to your average, worst first. */
  insights: BlindSpotInsight[];
}

/** Needs this many pairs in a situation before calling it a pattern. */
export const MIN_CELL = 3;

export const cellLabel = (corner: Spot, edge: Spot) => `${CORNER_SPOT_LABEL[corner]}, ${EDGE_SPOT_LABEL[edge]}`;

const avgOf = (xs: readonly PairSegment[], m: Metric) => mean(xs.map((x) => x[m]));

export function buildBlindSpots(perSolve: readonly PairSegment[][]): BlindSpotReport | null {
  const all = perSolve.flat();
  if (all.length === 0) return null;
  const overall = { totalMs: avgOf(all, "totalMs")!, findMs: avgOf(all, "findMs")!, execMs: avgOf(all, "execMs")! };

  const cells: SpotCell[] = [];
  for (const corner of SPOTS) {
    for (const edge of SPOTS) {
      const xs = all.filter((s) => s.corner === corner && s.edge === edge);
      cells.push({ corner, edge, count: xs.length, totalMs: avgOf(xs, "totalMs"), findMs: avgOf(xs, "findMs"), execMs: avgOf(xs, "execMs") });
    }
  }

  const insights: BlindSpotInsight[] = [];
  for (const c of cells) {
    if (c.count < MIN_CELL) continue;
    for (const metric of ["findMs", "execMs"] as const) {
      const ms = c[metric]!;
      if (ms > overall[metric] * 1.15 && ms - overall[metric] >= 120) {
        insights.push({ label: cellLabel(c.corner, c.edge), metric, ms, baselineMs: overall[metric], count: c.count });
      }
    }
  }
  insights.sort((a, b) => b.ms - b.baselineMs - (a.ms - a.baselineMs));

  return {
    pairs: all.length,
    solves: perSolve.filter((s) => s.length > 0).length,
    overall,
    cells,
    byPair: PAIR_LABELS.map((label, i) => {
      const xs = all.filter((s) => s.pair === i);
      return { label, count: xs.length, totalMs: avgOf(xs, "totalMs") };
    }),
    byOrder: [1, 2, 3, 4].map((order) => {
      const xs = all.filter((s) => s.order === order);
      return { order, count: xs.length, findMs: avgOf(xs, "findMs"), totalMs: avgOf(xs, "totalMs") };
    }),
    insights,
  };
}
