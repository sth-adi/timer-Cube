import { Cube, type CubeJSInstance } from "../cube-engine/engine";
import { CROSS_TABLE_B64, CROSS_TABLE_SIZE } from "./data/crossTable.generated";
import { decodeBase64Table } from "./data/decodeTable";
import { moveLabel } from "./moveNotation";

const CROSS_EDGES = [0, 1, 2, 3]; // UR, UF, UL, UB — see cube-engine/engine.ts CROSS_EDGES

let table: Uint8Array | null = null;
function getTable(): Uint8Array {
  if (!table) table = decodeBase64Table(CROSS_TABLE_B64, CROSS_TABLE_SIZE);
  return table;
}

function crossIndex(cube: CubeJSInstance): number {
  let idx = 0;
  for (const edgeId of CROSS_EDGES) idx = idx * 12 + cube.ep.indexOf(edgeId);
  for (const edgeId of CROSS_EDGES) {
    const slot = cube.ep.indexOf(edgeId);
    idx = idx * 2 + cube.eo[slot];
  }
  return idx;
}

/** Admissible lower bound on moves needed to restore the cross (0 if already solved). */
export function crossHeuristic(cube: CubeJSInstance): number {
  return getTable()[crossIndex(cube)];
}

/**
 * Returns a guaranteed-optimal move sequence solving the cross (the 4 U-face
 * / white edges), starting from the given scramble applied to a solved
 * cube. Every other piece (corners, other edges) is left wherever the
 * scramble put it.
 */
export function solveCrossOptimal(scramble: string): string[] {
  const cube = new Cube();
  cube.move(scramble);
  return solveCrossFromCube(cube);
}

/**
 * Same guaranteed-optimal cross solution, but from a cube already in the
 * position of interest rather than from a scramble string — which is what the
 * solve analyzer needs, since it compares against the state the cuber was
 * actually in rather than the start of the solve.
 */
export function solveCrossFromCube(start: CubeJSInstance): string[] {
  const dist = getTable();
  const cube = start.clone();

  let idx = crossIndex(cube);
  let remaining = dist[idx];
  if (remaining === 255) {
    throw new Error("Unreachable cross state — this should never happen for a valid scramble");
  }

  const moves: string[] = [];
  let current = cube;
  while (remaining > 0) {
    let found = false;
    for (let face = 0; face <= 5 && !found; face++) {
      for (let power = 0; power <= 2 && !found; power++) {
        const child = current.clone();
        for (let t = 0; t <= power; t++) child.multiply(Cube.moves[face]);
        const childIdx = crossIndex(child);
        const childDist = dist[childIdx];
        if (childDist === remaining - 1) {
          moves.push(moveLabel(face, power as 0 | 1 | 2));
          current = child;
          idx = childIdx;
          remaining = childDist;
          found = true;
        }
      }
    }
    if (!found) {
      throw new Error("Cross solver failed to find a descending move — table may be corrupt");
    }
  }
  return moves;
}
