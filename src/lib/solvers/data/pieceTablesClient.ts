import type { CubeJSInstance } from "../../cube-engine/engine";
import {
  F2lPairFR_B64,
  F2lPairFR_SIZE,
  F2lPairFL_B64,
  F2lPairFL_SIZE,
  F2lPairBL_B64,
  F2lPairBL_SIZE,
  F2lPairBR_B64,
  F2lPairBR_SIZE,
  LastLayerCorners_B64,
  LastLayerCorners_SIZE,
  LastLayerEdges_B64,
  LastLayerEdges_SIZE,
} from "./pieceTables.generated";
import { decodeBase64Table } from "./decodeTable";

export interface PairId {
  corner: number;
  edge: number;
}

export const F2L_PAIRS: readonly PairId[] = [
  { corner: 0, edge: 8 }, // FR (URF)
  { corner: 1, edge: 9 }, // FL (UFL)
  { corner: 2, edge: 10 }, // BL (ULB)
  { corner: 3, edge: 11 }, // BR (UBR)
];

const pairTableData: Record<number, { b64: string; size: number }> = {
  0: { b64: F2lPairFR_B64, size: F2lPairFR_SIZE },
  1: { b64: F2lPairFL_B64, size: F2lPairFL_SIZE },
  2: { b64: F2lPairBL_B64, size: F2lPairBL_SIZE },
  3: { b64: F2lPairBR_B64, size: F2lPairBR_SIZE },
};

const pairTableCache = new Map<number, Uint8Array>();
function getPairTable(cornerId: number): Uint8Array {
  let t = pairTableCache.get(cornerId);
  if (!t) {
    const d = pairTableData[cornerId];
    t = decodeBase64Table(d.b64, d.size);
    pairTableCache.set(cornerId, t);
  }
  return t;
}

export function pairHeuristic(cube: CubeJSInstance, pair: PairId): number {
  const table = getPairTable(pair.corner);
  const cSlot = cube.cp.indexOf(pair.corner);
  const cOri = cube.co[cSlot];
  const eSlot = cube.ep.indexOf(pair.edge);
  const eOri = cube.eo[eSlot];
  const idx = ((cSlot * 3 + cOri) * 12 + eSlot) * 2 + eOri;
  return table[idx];
}

export function isPairSolved(cube: CubeJSInstance, pair: PairId): boolean {
  return (
    cube.cp[pair.corner] === pair.corner &&
    cube.co[pair.corner] === 0 &&
    cube.ep[pair.edge] === pair.edge &&
    cube.eo[pair.edge] === 0
  );
}

let lastLayerCornersTable: Uint8Array | null = null;
let lastLayerEdgesTable: Uint8Array | null = null;

function getLastLayerCornersTable(): Uint8Array {
  if (!lastLayerCornersTable) {
    lastLayerCornersTable = decodeBase64Table(LastLayerCorners_B64, LastLayerCorners_SIZE);
  }
  return lastLayerCornersTable;
}
function getLastLayerEdgesTable(): Uint8Array {
  if (!lastLayerEdgesTable) {
    lastLayerEdgesTable = decodeBase64Table(LastLayerEdges_B64, LastLayerEdges_SIZE);
  }
  return lastLayerEdgesTable;
}

const LL_CORNERS = [4, 5, 6, 7];
const LL_EDGES = [4, 5, 6, 7];

export function lastLayerHeuristic(cube: CubeJSInstance): number {
  const cornersTable = getLastLayerCornersTable();
  let cIdx = 0;
  for (const id of LL_CORNERS) cIdx = cIdx * 8 + cube.cp.indexOf(id);
  for (const id of LL_CORNERS) {
    const slot = cube.cp.indexOf(id);
    cIdx = cIdx * 3 + cube.co[slot];
  }

  const edgesTable = getLastLayerEdgesTable();
  let eIdx = 0;
  for (const id of LL_EDGES) eIdx = eIdx * 12 + cube.ep.indexOf(id);
  for (const id of LL_EDGES) {
    const slot = cube.ep.indexOf(id);
    eIdx = eIdx * 2 + cube.eo[slot];
  }

  return Math.max(cornersTable[cIdx], edgesTable[eIdx]);
}
