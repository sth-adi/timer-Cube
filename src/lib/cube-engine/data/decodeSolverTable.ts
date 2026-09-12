/**
 * Fetches public/solver-tables.<version>.bin (see scripts/gen-solver-tables.cjs
 * and solverTablesManifest.generated.ts) and returns it as one ArrayBuffer,
 * ready to slice into per-table typed-array views. Works from a Worker
 * context (this only ever runs inside cube-engine/worker.ts) — `fetch` is
 * available in both.
 */
export async function fetchSolverTablesBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.arrayBuffer();
}

/** A zero-copy Int16 view into `buffer` at the given byte range. */
export function sliceInt16(buffer: ArrayBuffer, byteOffset: number, byteLength: number): Int16Array {
  return new Int16Array(buffer, byteOffset, byteLength / 2);
}

/** A zero-copy Uint32 view into `buffer` at the given byte range. */
export function sliceUint32(buffer: ArrayBuffer, byteOffset: number, byteLength: number): Uint32Array {
  return new Uint32Array(buffer, byteOffset, byteLength / 4);
}
