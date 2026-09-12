import Cube from "./vendor/index.js";
import { decodeInt16Table, decodeUint32Table } from "./data/decodeSolverTable";
import {
  MOVE_twist_ROWS, MOVE_twist_COLS, MOVE_twist_B64,
  MOVE_flip_ROWS, MOVE_flip_COLS, MOVE_flip_B64,
  MOVE_FRtoBR_ROWS, MOVE_FRtoBR_COLS, MOVE_FRtoBR_B64,
  MOVE_URFtoDLF_ROWS, MOVE_URFtoDLF_COLS, MOVE_URFtoDLF_B64,
  MOVE_URtoDF_ROWS, MOVE_URtoDF_COLS, MOVE_URtoDF_B64,
  MOVE_URtoUL_ROWS, MOVE_URtoUL_COLS, MOVE_URtoUL_B64,
  MOVE_UBtoDF_ROWS, MOVE_UBtoDF_COLS, MOVE_UBtoDF_B64,
  MOVE_mergeURtoDF_ROWS, MOVE_mergeURtoDF_COLS, MOVE_mergeURtoDF_B64,
  PRUNING_sliceTwist_LENGTH, PRUNING_sliceTwist_B64,
  PRUNING_sliceFlip_LENGTH, PRUNING_sliceFlip_B64,
  PRUNING_sliceURFtoDLFParity_LENGTH, PRUNING_sliceURFtoDLFParity_B64,
  PRUNING_sliceURtoDFParity_LENGTH, PRUNING_sliceURtoDFParity_B64,
} from "./data/solverTables.generated";

/**
 * Splits a flat, row-major Int16Array into `rows` zero-copy subarray views,
 * each `cols` long — reproducing the `Cube.moveTables[name][index][move]`
 * shape `computeMoveTable` (vendor/solve.js) builds at runtime, but as
 * lightweight views into one buffer instead of `rows` separate boxed-number
 * arrays (so this is a memory *improvement* over the original, not just a
 * faster load).
 */
function toRowViews(flat: Int16Array, rows: number, cols: number): Int16Array[] {
  const out: Int16Array[] = new Array(rows);
  for (let i = 0; i < rows; i++) out[i] = flat.subarray(i * cols, (i + 1) * cols);
  return out;
}

let loaded = false;

/**
 * Populates `Cube.moveTables`/`Cube.pruningTables` from data precomputed at
 * build time (scripts/gen-solver-tables.cjs), instead of letting
 * `Cube.initSolver()` compute them via BFS/DFS — measured at ~2.5s and
 * ~35MB of heap on a fast desktop CPU, so worse on typical mobile hardware,
 * and run unconditionally on every page load (the worker needs it just to
 * produce the very first scramble). `computeMoveTables`/`computePruningTables`
 * (vendor/solve.js) both skip any table that's already non-null, so once
 * this runs, `Cube.initSolver()` finds everything already populated and
 * returns immediately — nothing about the solver's own algorithm changes,
 * and a table missing or failing to decode here just falls back to that
 * table being computed normally, as if this function were never called.
 */
export function loadPrecomputedSolverTables(): void {
  if (loaded) return;
  loaded = true;
  try {
    Cube.moveTables.twist = toRowViews(decodeInt16Table(MOVE_twist_B64, MOVE_twist_ROWS * MOVE_twist_COLS), MOVE_twist_ROWS, MOVE_twist_COLS);
    Cube.moveTables.flip = toRowViews(decodeInt16Table(MOVE_flip_B64, MOVE_flip_ROWS * MOVE_flip_COLS), MOVE_flip_ROWS, MOVE_flip_COLS);
    Cube.moveTables.FRtoBR = toRowViews(decodeInt16Table(MOVE_FRtoBR_B64, MOVE_FRtoBR_ROWS * MOVE_FRtoBR_COLS), MOVE_FRtoBR_ROWS, MOVE_FRtoBR_COLS);
    Cube.moveTables.URFtoDLF = toRowViews(decodeInt16Table(MOVE_URFtoDLF_B64, MOVE_URFtoDLF_ROWS * MOVE_URFtoDLF_COLS), MOVE_URFtoDLF_ROWS, MOVE_URFtoDLF_COLS);
    Cube.moveTables.URtoDF = toRowViews(decodeInt16Table(MOVE_URtoDF_B64, MOVE_URtoDF_ROWS * MOVE_URtoDF_COLS), MOVE_URtoDF_ROWS, MOVE_URtoDF_COLS);
    Cube.moveTables.URtoUL = toRowViews(decodeInt16Table(MOVE_URtoUL_B64, MOVE_URtoUL_ROWS * MOVE_URtoUL_COLS), MOVE_URtoUL_ROWS, MOVE_URtoUL_COLS);
    Cube.moveTables.UBtoDF = toRowViews(decodeInt16Table(MOVE_UBtoDF_B64, MOVE_UBtoDF_ROWS * MOVE_UBtoDF_COLS), MOVE_UBtoDF_ROWS, MOVE_UBtoDF_COLS);
    Cube.moveTables.mergeURtoDF = toRowViews(decodeInt16Table(MOVE_mergeURtoDF_B64, MOVE_mergeURtoDF_ROWS * MOVE_mergeURtoDF_COLS), MOVE_mergeURtoDF_ROWS, MOVE_mergeURtoDF_COLS);

    Cube.pruningTables.sliceTwist = decodeUint32Table(PRUNING_sliceTwist_B64, PRUNING_sliceTwist_LENGTH);
    Cube.pruningTables.sliceFlip = decodeUint32Table(PRUNING_sliceFlip_B64, PRUNING_sliceFlip_LENGTH);
    Cube.pruningTables.sliceURFtoDLFParity = decodeUint32Table(PRUNING_sliceURFtoDLFParity_B64, PRUNING_sliceURFtoDLFParity_LENGTH);
    Cube.pruningTables.sliceURtoDFParity = decodeUint32Table(PRUNING_sliceURtoDFParity_B64, PRUNING_sliceURtoDFParity_LENGTH);
  } catch {
    // A corrupt or mismatched blob should never break scrambling/solving —
    // just fall back to Cube.initSolver() computing whatever didn't load.
  }
}
