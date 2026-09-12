import Cube from "./vendor/index.js";
import { fetchSolverTablesBuffer, sliceInt16, sliceUint32 } from "./data/decodeSolverTable";
import { SOLVER_TABLES_URL, MOVE_TABLE_MANIFEST, PRUNING_TABLE_MANIFEST } from "./data/solverTablesManifest.generated";

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
 * produce the very first scramble).
 *
 * The data is a plain static asset (public/solver-tables.*.bin), fetched
 * once here — deliberately NOT embedded as a string constant in this
 * module. An earlier version of this fix did exactly that, and it bloated
 * the cube-engine worker's own script to 7MB+, which is itself a plausible
 * failure mode on constrained mobile connections/devices: a Worker can't
 * respond to anything until its whole script downloads, parses, and
 * compiles, so a script that size — on top of everything else already in
 * that bundle — could easily be *worse* for exactly the devices this is
 * meant to help. A fetched asset is a normal, independently cacheable HTTP
 * resource instead, decoded straight from raw bytes with no base64 overhead.
 *
 * `computeMoveTables`/`computePruningTables` (vendor/solve.js) both skip any
 * table that's already non-null, so once this runs, `Cube.initSolver()`
 * finds everything already populated and returns immediately — nothing
 * about the solver's own algorithm changes, and any table that fails to
 * load (network error, corrupt/mismatched asset) just falls back to being
 * computed normally, as if this function had never run for that table.
 */
export async function loadPrecomputedSolverTables(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const buffer = await fetchSolverTablesBuffer(SOLVER_TABLES_URL);
    for (const entry of MOVE_TABLE_MANIFEST) {
      const flat = sliceInt16(buffer, entry.byteOffset, entry.byteLength);
      Cube.moveTables[entry.name] = toRowViews(flat, entry.rows, entry.cols);
    }
    for (const entry of PRUNING_TABLE_MANIFEST) {
      Cube.pruningTables[entry.name] = sliceUint32(buffer, entry.byteOffset, entry.byteLength);
    }
  } catch {
    // A network failure, or a corrupt/mismatched asset, should never break
    // scrambling/solving — just fall back to Cube.initSolver() computing
    // whatever didn't load.
  }
}
