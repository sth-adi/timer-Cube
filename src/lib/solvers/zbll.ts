import { Cube, applyFaceTurn, type CubeJSInstance } from "../cube-engine/engine";
import { idaStarSolve } from "./idaStar";
import { crossHeuristic } from "./cross";
import { F2L_PAIRS, pairHeuristic } from "./data/pieceTablesClient";
import { bottomLayerSolved } from "./oll";

const LAST_LAYER_FACES = [1, 2, 3, 4, 5] as const; // R, F, D, L, B — no U
const LL_EDGES = [4, 5, 6, 7];

/** ZBLL's precondition: F2L solved and every last-layer edge already oriented (corners may not be). */
function isEoGoal(cube: CubeJSInstance): boolean {
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return bottomLayerSolved(cube);
}

// Pruning table over just the four last-layer edges' orientation (ignoring
// corners entirely, unlike oll.ts's table) — 2^4 = 16 states.
const EO_TABLE_SIZE = 2 ** 4;
let eoTable: Uint8Array | null = null;

function eoIndex(cube: CubeJSInstance): number {
  let idx = 0;
  for (const s of LL_EDGES) idx = idx * 2 + cube.eo[s];
  return idx;
}

function buildEoTable(): Uint8Array {
  const dist = new Uint8Array(EO_TABLE_SIZE).fill(255);
  const start = new Cube();
  dist[eoIndex(start)] = 0;
  let frontier: CubeJSInstance[] = [start];
  let depth = 0;
  while (frontier.length > 0) {
    const next: CubeJSInstance[] = [];
    for (const state of frontier) {
      for (const face of LAST_LAYER_FACES) {
        for (let power = 0; power <= 2; power++) {
          const child = applyFaceTurn(state, face, power as 0 | 1 | 2);
          const idx = eoIndex(child);
          if (dist[idx] === 255) {
            dist[idx] = depth + 1;
            next.push(child);
          }
        }
      }
    }
    frontier = next;
    depth++;
  }
  return dist;
}

function getEoTable(): Uint8Array {
  if (!eoTable) eoTable = buildEoTable();
  return eoTable;
}

function eoHeuristic(cube: CubeJSInstance): number {
  let h = Math.max(getEoTable()[eoIndex(cube)], crossHeuristic(cube));
  for (const pair of F2L_PAIRS) {
    const ph = pairHeuristic(cube, pair);
    if (ph > h) h = ph;
  }
  return h;
}

const SEARCH_TIERS = [
  { maxDepth: 7, maxNodes: 150_000 },
  { maxDepth: 9, maxNodes: 1_200_000 },
];

/**
 * Orients just the last layer's edges — leaving corner orientation and all
 * permutation untouched — keeping cross and F2L intact. This is exactly the
 * precondition ZBLL is named for: OLL's edge-orientation step done, corner
 * orientation and full permutation (both corners and edges) left as one
 * combined case to solve in a single algorithm. Mutates `cube` in place.
 */
export function solveEdgeOrientation(cube: CubeJSInstance): string[] {
  let moves: string[] | null = null;
  for (const tier of SEARCH_TIERS) {
    moves = idaStarSolve(cube, { heuristic: eoHeuristic, isGoal: isEoGoal, faces: LAST_LAYER_FACES, ...tier });
    if (moves) break;
  }
  if (!moves) throw new Error("ZBLL edge-orientation solver failed");
  if (moves.length > 0) cube.move(moves.join(" "));
  return moves;
}
