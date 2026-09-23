import { bottomLayerSolved, f2lPairSolved } from "@/lib/solvers/oll";
import { F2L_PAIRS, pairHeuristic } from "@/lib/solvers/data/pieceTablesClient";
import { PAIR_LABELS, crossSolved, mean, replayStates, type XraySolveInput } from "./common";

/**
 * F2L Flow: how each of the four pairs' distance-to-solved moved, turn by
 * turn, from the moment the cross was done until F2L was. "Distance" is the
 * true minimum number of turns that pair alone needs (an exact lookup table
 * per pair), so the four lines on the chart are real — you can watch a pair
 * sit at 7, drop to 3 because the insertion before it happened to set it
 * up, and then fall to 0.
 *
 * From the same lines it answers two questions no timer can:
 *  - **Pair choice:** when you started each pair, was it the easiest one
 *    available? ("You went for a 7-move pair while Blue-Red was 2 away.")
 *  - **Side effects:** while solving one pair, how much did you set up — or
 *    scatter — the pairs still to come? Advanced F2L is exactly the art of
 *    making the next pair easier with the current one.
 */

export interface FlowPoint {
  /** The move this state follows — the first point is the move that completed the cross. */
  moveIndex: number;
  atMs: number;
  /** Per pair (engine index 0-3): turns that pair alone still needs. */
  distances: number[];
}

export interface PairSideEffect {
  pair: number;
  before: number;
  after: number;
}

export interface PairDecision {
  pair: number;
  label: string;
  /** Move indices bounding the stretch spent on this pair. */
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  movesUsed: number;
  /** The chosen pair's distance when you started on it. */
  chosenDistance: number;
  /** The easiest still-unsolved pair at that moment. */
  easiestPair: number;
  easiestDistance: number;
  /** Extra turns the chosen pair needed over the easiest available one (0 = you picked the easiest). */
  regret: number;
  /** How the other still-unsolved pairs moved while you worked on this one. */
  sideEffects: PairSideEffect[];
}

export interface F2lFlowReport {
  points: FlowPoint[];
  decisions: PairDecision[];
  /** Pairs already solved the moment the cross was done. */
  freePairs: number[];
  /** Share of decisions where you picked the (joint) easiest pair. */
  easiestPickRate: number;
  /** Total distance other pairs dropped for free while you solved something else. */
  setupGained: number;
  /** Total distance other pairs grew while you solved something else. */
  scatter: number;
  /** 0-100 summary: picking easy pairs and setting up the next ones scores high. */
  flowScore: number;
}

export function analyzeF2lFlow({ scramble, moves, timesMs }: XraySolveInput): F2lFlowReport | null {
  const { after } = replayStates(scramble, moves);
  const crossIdx = after.findIndex(crossSolved);
  const f2lIdx = after.findIndex((c) => bottomLayerSolved(c));
  if (crossIdx < 0 || f2lIdx < 0 || f2lIdx < crossIdx) return null;

  const t = (i: number) => timesMs[i] ?? 0;
  const points: FlowPoint[] = [];
  for (let i = crossIdx; i <= f2lIdx; i++) {
    points.push({ moveIndex: i, atMs: t(i), distances: F2L_PAIRS.map((p) => pairHeuristic(after[i], p)) });
  }
  const solvedAt = (i: number, p: number) => f2lPairSolved(after[i], p as 0 | 1 | 2 | 3);

  // When each pair was completed: a milestone is any state with the cross
  // intact and more pairs solved than ever before. Insertions routinely lift
  // an already-solved neighbour out for a turn or two (F R U R' F'), so a
  // pair only counts once the whole F2L-so-far is standing again with it in.
  const finalIdx = [crossIdx, crossIdx, crossIdx, crossIdx];
  const completed = new Set<number>();
  const initial = [0, 1, 2, 3].filter((p) => solvedAt(crossIdx, p));
  for (const p of initial) completed.add(p);
  for (let i = crossIdx + 1; i <= f2lIdx; i++) {
    if (!crossSolved(after[i])) continue;
    const solvedNow = [0, 1, 2, 3].filter((p) => solvedAt(i, p));
    if (solvedNow.length <= completed.size) continue;
    for (const p of solvedNow) {
      if (!completed.has(p)) {
        completed.add(p);
        finalIdx[p] = i;
      }
    }
  }
  const freePairs = initial;

  const order = [0, 1, 2, 3].filter((p) => !freePairs.includes(p)).sort((a, b) => finalIdx[a] - finalIdx[b]);
  const decisions: PairDecision[] = [];
  let segStart = crossIdx;
  const distAt = (i: number, p: number) => points[i - crossIdx].distances[p];
  for (const pair of order) {
    const end = finalIdx[pair];
    if (end > segStart) {
      const open = [0, 1, 2, 3].filter((q) => finalIdx[q] > segStart);
      const easiestPair = open.reduce((best, q) => (distAt(segStart, q) < distAt(segStart, best) ? q : best), pair);
      decisions.push({
        pair,
        label: PAIR_LABELS[pair],
        startIndex: segStart,
        endIndex: end,
        startMs: t(segStart),
        endMs: t(end),
        movesUsed: end - segStart,
        chosenDistance: distAt(segStart, pair),
        easiestPair,
        easiestDistance: distAt(segStart, easiestPair),
        regret: distAt(segStart, pair) - distAt(segStart, easiestPair),
        sideEffects: open
          .filter((q) => q !== pair && finalIdx[q] > end)
          .map((q) => ({ pair: q, before: distAt(segStart, q), after: distAt(end, q) })),
      });
    }
    segStart = Math.max(segStart, end);
  }

  const effects = decisions.flatMap((d) => d.sideEffects);
  const setupGained = effects.reduce((s, e) => s + Math.max(0, e.before - e.after), 0);
  const scatter = effects.reduce((s, e) => s + Math.max(0, e.after - e.before), 0);
  const easiestPickRate = decisions.length ? decisions.filter((d) => d.regret === 0).length / decisions.length : 1;
  const avgRegret = mean(decisions.map((d) => d.regret)) ?? 0;
  const n = Math.max(1, decisions.length);
  const flowScore = Math.max(0, Math.min(100, Math.round(85 - 10 * avgRegret + (6 * setupGained - 4 * scatter) / n + 5 * freePairs.length)));

  return { points, decisions, freePairs, easiestPickRate, setupGained, scatter, flowScore };
}

export interface FlowHistory {
  solves: number;
  avgFlowScore: number;
  easiestPickRate: number;
  avgRegret: number;
  setupPerSolve: number;
  scatterPerSolve: number;
}

export function summarizeFlowHistory(reports: readonly F2lFlowReport[]): FlowHistory | null {
  if (reports.length === 0) return null;
  const decisions = reports.flatMap((r) => r.decisions);
  return {
    solves: reports.length,
    avgFlowScore: mean(reports.map((r) => r.flowScore)) ?? 0,
    easiestPickRate: decisions.length ? decisions.filter((d) => d.regret === 0).length / decisions.length : 1,
    avgRegret: mean(decisions.map((d) => d.regret)) ?? 0,
    setupPerSolve: (mean(reports.map((r) => r.setupGained)) ?? 0),
    scatterPerSolve: (mean(reports.map((r) => r.scatter)) ?? 0),
  };
}
