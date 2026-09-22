import { Cube, applyFaceTurn, type CubeJSInstance } from "../cube-engine/engine";
import { idaStarSolve } from "./idaStar";
import { crossHeuristic } from "./cross";
import { F2L_PAIRS, pairHeuristic } from "./data/pieceTablesClient";

const LAST_LAYER_FACES = [1, 2, 3, 4, 5] as const; // R, F, D, L, B — no U

const CROSS_EDGES = [0, 1, 2, 3];
const F2L_CORNERS = [0, 1, 2, 3];
const F2L_EDGES = [8, 9, 10, 11];
const LL_CORNERS = [4, 5, 6, 7];
const LL_EDGES = [4, 5, 6, 7];

/** True once the cross and all four F2L pairs are solved (last layer on D untouched). */
export function bottomLayerSolved(cube: CubeJSInstance): boolean {
  for (const s of CROSS_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  for (const s of F2L_CORNERS) if (cube.cp[s] !== s || cube.co[s] !== 0) return false;
  for (const s of F2L_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  return true;
}

/**
 * True once one specific F2L pair (corner slot `pairIndex` 0-3, paired with
 * edge slot `pairIndex` within F2L_EDGES — URF/FR, UFL/FL, ULB/BL, UBR/BR,
 * by construction of F2L_CORNERS/F2L_EDGES above) is in its home position
 * and oriented, independent of the other 3 pairs or the cross. Lets a live
 * smart-cube solve detect each pair's own completion moment, not just "all
 * four done."
 */
export function f2lPairSolved(cube: CubeJSInstance, pairIndex: 0 | 1 | 2 | 3): boolean {
  const corner = F2L_CORNERS[pairIndex];
  const edge = F2L_EDGES[pairIndex];
  return cube.cp[corner] === corner && cube.co[corner] === 0 && cube.ep[edge] === edge && cube.eo[edge] === 0;
}

/** True once every last-layer piece faces up, regardless of permutation. */
export function orientationSolved(cube: CubeJSInstance): boolean {
  for (const s of LL_CORNERS) if (cube.co[s] !== 0) return false;
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return true;
}

function isOllGoal(cube: CubeJSInstance): boolean {
  return orientationSolved(cube) && bottomLayerSolved(cube);
}

// Small pruning table over just (co[0..3], eo[0..3]) — orientation only,
// ignoring permutation entirely (OLL doesn't care which piece is where,
// only which way up it is). 3^4 * 2^4 = 1296 states; built once, lazily.
const ORI_TABLE_SIZE = 3 ** 4 * 2 ** 4;
let oriTable: Uint8Array | null = null;

function orientationIndex(cube: CubeJSInstance): number {
  let idx = 0;
  for (const s of LL_CORNERS) idx = idx * 3 + cube.co[s];
  for (const s of LL_EDGES) idx = idx * 2 + cube.eo[s];
  return idx;
}

function buildOriTable(): Uint8Array {
  const dist = new Uint8Array(ORI_TABLE_SIZE).fill(255);
  const start = new Cube();
  dist[orientationIndex(start)] = 0;
  let frontier: CubeJSInstance[] = [start];
  let depth = 0;
  while (frontier.length > 0) {
    const next: CubeJSInstance[] = [];
    for (const state of frontier) {
      for (const face of LAST_LAYER_FACES) {
        for (let power = 0; power <= 2; power++) {
          const child = applyFaceTurn(state, face, power as 0 | 1 | 2);
          const idx = orientationIndex(child);
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

function getOriTable(): Uint8Array {
  if (!oriTable) oriTable = buildOriTable();
  return oriTable;
}

function ollHeuristic(cube: CubeJSInstance): number {
  let h = Math.max(getOriTable()[orientationIndex(cube)], crossHeuristic(cube));
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
 * Orients the last layer (all last-layer stickers facing up), keeping cross
 * and F2L intact. This is the "OLL" step of CFOP. Mutates `cube` in place.
 * Throws if no solution is found within the search budget (the rare hard
 * case) — callers should have a fallback (see cfop.ts).
 */
export function solveOLL(cube: CubeJSInstance): string[] {
  let moves: string[] | null = null;
  for (const tier of SEARCH_TIERS) {
    moves = idaStarSolve(cube, { heuristic: ollHeuristic, isGoal: isOllGoal, faces: LAST_LAYER_FACES, ...tier });
    if (moves) break;
  }
  if (!moves) throw new Error("OLL solver failed");
  if (moves.length > 0) cube.move(moves.join(" "));
  return moves;
}
