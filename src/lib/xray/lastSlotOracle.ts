import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, f2lPairSolved } from "@/lib/solvers/oll";
import { crossHeuristic } from "@/lib/solvers/cross";
import { F2L_PAIRS, pairHeuristic } from "@/lib/solvers/data/pieceTablesClient";
import { moveLabel } from "@/lib/solvers/moveNotation";
import { isOllSkip, isPllSkip, recognizeOll, toLibraryFrame } from "@/lib/analysis/recognize";
import { PAIR_LABELS, crossSolved, inGrip, replayStates, slotGrip, type XraySolveInput } from "./common";

/**
 * Last Slot Oracle. The last F2L pair is the one moment in a CFOP solve
 * where *how* you insert decides what last layer you get: every one of the
 * handful of short insertions for that exact position leaves the yellow
 * face in a different state. This finds all of them — every insertion up
 * to two turns longer than the shortest possible — and reports which OLL
 * each one would have left you with, so after every solve you can see
 * whether an OLL skip, an easier case, or even a full LL skip was one
 * insertion choice away.
 *
 * Pure search over the real cube state from your own solve (no tables of
 * pre-computed tricks), restricted to the three faces an insertion into
 * that slot really uses (see SLOT_FACES), and displayed in the natural grip
 * for that slot (yellow on top, slot at front-right) — so every suggestion
 * reads as an <R, U, F> insertion you could actually do.
 */

/** How many turns beyond the shortest insertion are still worth showing. */
export const EXTRA_DEPTH = 2;
/** Hard cap on insertion length searched. */
export const MAX_DEPTH = 13;
/** Search node budget — a pathological position degrades to a partial answer rather than a hang. */
export const NODE_BUDGET = 1_500_000;

/**
 * The faces an insertion into each slot actually uses — the two side faces
 * around the slot plus the yellow layer (engine face indices: R=1, F=2,
 * D=3, L=4, B=5). That's the <R, U, F> move set every last-slot technique
 * lives in (edge control, sledgehammers, VLS-style inserts), and keeping to
 * it both makes every suggestion something you'd really do and keeps the
 * search to a fraction of a second.
 */
const SLOT_FACES: readonly (readonly number[])[] = [
  [1, 2, 3],
  [2, 3, 4],
  [3, 4, 5],
  [1, 3, 5],
];

export type LastLayerOutcomeKind = "ll-skip" | "oll-skip" | "edges-oriented" | "oll";

export interface LastLayerOutcome {
  kind: LastLayerOutcomeKind;
  /** OLL case name, or null for a skip / a state outside the library. */
  ollName: string | null;
  /** Moves in the standard algorithm for that OLL (0 for a skip). */
  ollAlgMoves: number;
  /** Yellow edges already facing up (0-4). */
  edgesOriented: number;
}

export interface InsertionOption {
  /** Engine-frame moves. */
  moves: string[];
  /** The same insertion as a cuber would read it: yellow top, this slot at front-right. */
  display: string;
  outcome: LastLayerOutcome;
  /** Insertion length + the OLL algorithm it leaves — the fair "total turns to finish OLL" cost. */
  cost: number;
}

export interface OracleReport {
  lastPair: number;
  lastPairLabel: string;
  /** Index of the move that left the last pair as the only one open. */
  startIndex: number;
  yours: InsertionOption;
  /** Distinct outcomes found, best first (one representative insertion each). */
  options: InsertionOption[];
  /** Shortest <R, U, F> insertion from the start position. */
  shortestInsertion: number;
  /** The best option, if it beats what you did. */
  better: InsertionOption | null;
  /** Whether some insertion would have skipped OLL. */
  skipAvailable: boolean;
  /** True when the search ran out of budget before finishing. */
  partial: boolean;
  /** Longest insertion the search considered. */
  searchedDepth: number;
}

const LL_EDGES = [4, 5, 6, 7];
const LL_CORNERS = [4, 5, 6, 7];

export function lastLayerOutcome(cube: CubeJSInstance): LastLayerOutcome {
  const library = toLibraryFrame(cube);
  const edgesOriented = LL_EDGES.filter((s) => cube.eo[s] === 0).length;
  if (isOllSkip(library)) {
    return { kind: isPllSkip(library) ? "ll-skip" : "oll-skip", ollName: null, ollAlgMoves: 0, edgesOriented };
  }
  const match = recognizeOll(library);
  // A state outside the library shouldn't happen after a clean F2L; price it as a typical OLL.
  const ollAlgMoves = match ? match.algMoves : TYPICAL_OLL_MOVES;
  return { kind: edgesOriented === 4 ? "edges-oriented" : "oll", ollName: match?.case.name ?? null, ollAlgMoves, edgesOriented };
}

const TYPICAL_OLL_MOVES = 11;

/** Last-layer state key modulo AUF, so insertions that differ only by a final U turn count as one outcome. */
function llKey(cube: CubeJSInstance): string {
  let best: string | null = null;
  const c = cube.clone();
  for (let k = 0; k < 4; k++) {
    const key = LL_CORNERS.map((s) => `${c.cp[s]}.${c.co[s]}`).join(",") + "|" + LL_EDGES.map((s) => `${c.ep[s]}.${c.eo[s]}`).join(",");
    if (best === null || key < best) best = key;
    c.move("D");
  }
  return best!;
}

function stateKey(c: CubeJSInstance): string {
  let key = "";
  for (let i = 0; i < 8; i++) key += String.fromCharCode(65 + c.cp[i] * 3 + c.co[i]);
  for (let i = 0; i < 12; i++) key += String.fromCharCode(65 + c.ep[i] * 2 + c.eo[i]);
  return key;
}

function heuristic(c: CubeJSInstance): number {
  let h = crossHeuristic(c);
  for (const p of F2L_PAIRS) {
    const d = pairHeuristic(c, p);
    if (d > h) h = d;
  }
  return h;
}

/**
 * Every F2L-completing insertion from `start` of length ≤ `limit`, one per
 * distinct last-layer outcome (keeping the shortest). Depth-first with an
 * exact-per-piece admissible bound, so paths that can't finish in time are
 * cut immediately.
 */
function enumerateInsertions(
  start: CubeJSInstance,
  faceSet: readonly number[],
  limit: number,
  budget: { nodes: number },
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const path: string[] = [];
  const faces: number[] = [];
  // Transposition table: everything reachable from a state within the
  // remaining depth has already been collected if we've been here before at
  // the same or a shallower depth.
  const seen = new Map<string, number>();
  const dfs = (node: CubeJSInstance, g: number) => {
    if (budget.nodes-- <= 0) return;
    if (g > 0 && bottomLayerSolved(node)) {
      const key = llKey(node);
      const prev = found.get(key);
      if (!prev || prev.length > path.length) found.set(key, [...path]);
      return;
    }
    if (g + heuristic(node) > limit) return;
    const key = stateKey(node);
    const prev = seen.get(key);
    if (prev !== undefined && prev <= g) return;
    seen.set(key, g);
    const last = faces[faces.length - 1];
    for (const face of faceSet) {
      if (face === last) continue;
      if (last !== undefined && face % 3 === last % 3 && face < last) continue;
      let child = node;
      for (let power = 0; power <= 2; power++) {
        child = child.clone();
        child.multiply(Cube.moves[face]);
        path.push(moveLabel(face, power as 0 | 1 | 2));
        faces.push(face);
        dfs(child, g + 1);
        path.pop();
        faces.pop();
      }
    }
  };
  dfs(start, 0);
  return found;
}

function shortestLength(start: CubeJSInstance, faceSet: readonly number[], budget: { nodes: number }): number | null {
  for (let limit = Math.max(1, heuristic(start)); limit <= MAX_DEPTH; limit++) {
    if (enumerateInsertions(start, faceSet, limit, budget).size > 0) return limit;
    if (budget.nodes <= 0) return null;
  }
  return null;
}

const KIND_RANK: Record<LastLayerOutcomeKind, number> = { "ll-skip": 0, "oll-skip": 1, "edges-oriented": 2, oll: 3 };

function compareOptions(a: InsertionOption, b: InsertionOption): number {
  return a.cost - b.cost || KIND_RANK[a.outcome.kind] - KIND_RANK[b.outcome.kind] || a.moves.length - b.moves.length;
}

export interface OracleOptions {
  extraDepth?: number;
  nodeBudget?: number;
}

export function runLastSlotOracle({ scramble, moves }: XraySolveInput, opts: OracleOptions = {}): OracleReport | null {
  const { after } = replayStates(scramble, moves);
  const f2lIdx = after.findIndex((c) => bottomLayerSolved(c));
  if (f2lIdx < 1) return null;

  // The last-slot stretch starts at the latest point before F2L finished
  // where the cross and exactly three pairs were solved (an insertion like
  // R U R' breaks the cross mid-way, so the moves right before F2L completes
  // usually aren't such a point). Then walk back over any setup turns that
  // kept that three-pair state, so pre-insertion U turns count as part of
  // the choice.
  const solvedPairs = (c: CubeJSInstance) => [0, 1, 2, 3].filter((p) => f2lPairSolved(c, p as 0 | 1 | 2 | 3));
  let startIndex = -1;
  for (let i = f2lIdx - 1; i >= 0; i--) {
    if (crossSolved(after[i]) && solvedPairs(after[i]).length === 3) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return null;
  const lastPair = [0, 1, 2, 3].find((p) => !f2lPairSolved(after[startIndex], p as 0 | 1 | 2 | 3))!;
  const others = [0, 1, 2, 3].filter((p) => p !== lastPair);
  const ready = (c: CubeJSInstance) =>
    crossSolved(c) && others.every((p) => f2lPairSolved(c, p as 0 | 1 | 2 | 3)) && !f2lPairSolved(c, lastPair as 0 | 1 | 2 | 3);
  while (startIndex > 0 && ready(after[startIndex - 1])) startIndex--;
  const start = after[startIndex];

  const grip = slotGrip(lastPair);
  const yourMoves = moves.slice(startIndex + 1, f2lIdx + 1);
  const yourOutcome = lastLayerOutcome(after[f2lIdx]);
  const yours: InsertionOption = {
    moves: [...yourMoves],
    display: inGrip(yourMoves, grip).join(" "),
    outcome: yourOutcome,
    cost: yourMoves.length + yourOutcome.ollAlgMoves,
  };

  const budget = { nodes: opts.nodeBudget ?? NODE_BUDGET };
  const faceSet = SLOT_FACES[lastPair];
  const shortest = shortestLength(start, faceSet, budget);
  if (shortest === null) {
    return {
      lastPair,
      lastPairLabel: PAIR_LABELS[lastPair],
      startIndex,
      yours,
      options: [],
      shortestInsertion: yourMoves.length,
      better: null,
      skipAvailable: false,
      partial: true,
      searchedDepth: 0,
    };
  }
  const searchedDepth = Math.min(MAX_DEPTH, shortest + (opts.extraDepth ?? EXTRA_DEPTH));
  const found = enumerateInsertions(start, faceSet, searchedDepth, budget);

  const options: InsertionOption[] = [...found.values()].map((ins) => {
    const end = start.clone();
    end.move(ins.join(" "));
    const outcome = lastLayerOutcome(end);
    return { moves: ins, display: inGrip(ins, grip).join(" "), outcome, cost: ins.length + outcome.ollAlgMoves };
  });
  options.sort(compareOptions);
  const best = options[0] ?? null;

  return {
    lastPair,
    lastPairLabel: PAIR_LABELS[lastPair],
    startIndex,
    yours,
    options,
    shortestInsertion: shortest,
    better: best && best.cost < yours.cost ? best : null,
    skipAvailable: options.some((o) => o.outcome.kind === "oll-skip" || o.outcome.kind === "ll-skip"),
    partial: budget.nodes <= 0,
    searchedDepth,
  };
}

export interface OracleHistory {
  solves: number;
  /** Share of solves where some insertion would have skipped OLL. */
  skipAvailableRate: number;
  /** Share of solves where you actually got an OLL (or LL) skip. */
  skipTakenRate: number;
  /** Mean turns a better last-slot choice would have saved (0 when yours was best). */
  avgTurnsSaved: number;
}

export function summarizeOracleHistory(reports: readonly OracleReport[]): OracleHistory | null {
  if (reports.length === 0) return null;
  const n = reports.length;
  return {
    solves: n,
    skipAvailableRate: reports.filter((r) => r.skipAvailable).length / n,
    skipTakenRate: reports.filter((r) => r.yours.outcome.kind === "oll-skip" || r.yours.outcome.kind === "ll-skip").length / n,
    avgTurnsSaved: reports.reduce((s, r) => s + (r.better ? r.yours.cost - r.better.cost : 0), 0) / n,
  };
}
