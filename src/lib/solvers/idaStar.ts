import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { moveLabel } from "./moveNotation";

export interface IdaOptions {
  /** Admissible (never overestimating) lower bound on moves remaining. */
  heuristic: (cube: CubeJSInstance) => number;
  isGoal: (cube: CubeJSInstance) => boolean;
  /** Face indices (0-5) allowed as moves. */
  faces: readonly number[];
  maxDepth?: number;
  maxNodes?: number;
}

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_MAX_NODES = 4_000_000;

function stateKey(c: CubeJSInstance): string {
  // Transposition key covering full corner+edge perm/ori. Built as a plain
  // string (not accumulated into a single number) since 12 edges x 24
  // combinations each = 24^12 ≈ 3.2e16 blows past Number.MAX_SAFE_INTEGER
  // (2^53 ≈ 9e15) — packing that into one float silently loses precision
  // and causes hash collisions, which would make IDA* wrongly treat two
  // different cube states as "already visited" and prune a valid path.
  let key = "";
  for (let i = 0; i < 8; i++) key += c.cp[i] * 3 + c.co[i] + ",";
  for (let i = 0; i < 12; i++) key += c.ep[i] * 2 + c.eo[i] + ",";
  return key;
}

/**
 * Generic IDA* search over the cube's move graph, with a per-iteration
 * transposition table (prunes revisiting the same state via a longer path)
 * and a node budget so a weak heuristic degrades to "no solution found"
 * instead of hanging. Returns a shortest move sequence (in the given face
 * set) taking `start` to a state satisfying `isGoal`, or null if none is
 * found within maxDepth/maxNodes.
 */
export function idaStarSolve(start: CubeJSInstance, opts: IdaOptions): string[] | null {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  if (opts.isGoal(start)) return [];

  let threshold = opts.heuristic(start);
  const path: string[] = [];
  const faceHistory: number[] = [];
  let nodes = 0;
  let seen: Map<string, number> = new Map();

  function search(node: CubeJSInstance, g: number, bound: number): number | "FOUND" | "BUDGET" {
    nodes++;
    if (nodes > maxNodes) return "BUDGET";

    const h = opts.heuristic(node);
    const f = g + h;
    if (f > bound) return f;
    if (opts.isGoal(node)) return "FOUND";
    if (g >= maxDepth) return Infinity;

    const key = stateKey(node);
    const prevBest = seen.get(key);
    if (prevBest !== undefined && prevBest <= g) return Infinity;
    seen.set(key, g);

    let min = Infinity;
    const lastFace = faceHistory[faceHistory.length - 1];
    for (const face of opts.faces) {
      if (face === lastFace) continue; // redundant: would merge into one move
      // Opposite-face moves commute (e.g. R then L === L then R), so only
      // explore one canonical order — halves branching for those pairs
      // without losing any reachable state or optimal solution.
      if (lastFace !== undefined && face % 3 === lastFace % 3 && face < lastFace) continue;
      for (let power = 0; power <= 2; power++) {
        const child = node.clone();
        for (let t = 0; t <= power; t++) child.multiply(Cube.moves[face]);
        path.push(moveLabel(face, power as 0 | 1 | 2));
        faceHistory.push(face);
        const result = search(child, g + 1, bound);
        if (result === "FOUND" || result === "BUDGET") return result;
        if (result < min) min = result;
        path.pop();
        faceHistory.pop();
      }
    }
    return min;
  }

  const debug = typeof process !== "undefined" && process.env && process.env.IDA_DEBUG === "1";
  const MAX_ITERATIONS = 40;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    seen = new Map();
    const nodesBefore = nodes;
    const result = search(start, 0, threshold);
    if (debug) {
      console.error(`[ida] iter=${iter} threshold=${threshold} nodesThisIter=${nodes - nodesBefore} totalNodes=${nodes} result=${result}`);
    }
    if (result === "FOUND") return [...path];
    if (result === "BUDGET") return null;
    if (result === Infinity) return null;
    threshold = result;
    if (threshold > maxDepth) return null;
  }
  return null;
}
