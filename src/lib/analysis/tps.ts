/**
 * Turns-per-second telemetry from a raw smart-cube move timestamp stream.
 * Pure and separate from the store so it's directly testable without a
 * Bluetooth connection.
 */

export interface TpsBucket {
  /** Bucket start, ms since the first move. */
  startMs: number;
  moveCount: number;
  /** moveCount / bucket width in seconds. */
  tps: number;
}

/** Buckets a move-timestamp stream into fixed windows and counts turns per window. */
export function computeTpsBuckets(timestampsMs: readonly number[], bucketMs = 1000): TpsBucket[] {
  if (timestampsMs.length === 0) return [];
  const start = timestampsMs[0];
  const end = timestampsMs[timestampsMs.length - 1];
  const bucketCount = Math.max(1, Math.ceil((end - start + 1) / bucketMs));

  const counts = new Array<number>(bucketCount).fill(0);
  for (const t of timestampsMs) {
    const idx = Math.min(bucketCount - 1, Math.floor((t - start) / bucketMs));
    counts[idx]++;
  }

  return counts.map((moveCount, i) => ({
    startMs: i * bucketMs,
    moveCount,
    tps: moveCount / (bucketMs / 1000),
  }));
}

/** Overall average turns per second across the whole stream. */
export function averageTps(timestampsMs: readonly number[]): number | null {
  if (timestampsMs.length < 2) return null;
  const durationSec = (timestampsMs[timestampsMs.length - 1] - timestampsMs[0]) / 1000;
  if (durationSec <= 0) return null;
  return (timestampsMs.length - 1) / durationSec;
}

/** The single fastest bucket's TPS — a quick "peak speed" readout. */
export function peakTps(buckets: readonly TpsBucket[]): number {
  return buckets.reduce((max, b) => Math.max(max, b.tps), 0);
}

/**
 * Turns per second in the `windowMs` immediately before `atMs` — a live
 * "how fast right now" speedometer, distinct from `computeTpsBuckets`'
 * fixed windows aligned to the very first move (right for a post-solve
 * graph of the whole solve, wrong for "what's my hand speed at this
 * instant" — that has to slide with the clock, not sit still at bucket
 * boundaries from a while ago). Naturally decays to 0 the moment turning
 * stops, since a window with nothing recent in it has nothing to count.
 */
export function rollingTps(timestampsMs: readonly number[], atMs: number, windowMs = 1000): number {
  const from = atMs - windowMs;
  let count = 0;
  for (const t of timestampsMs) if (t > from && t <= atMs) count++;
  return count / (windowMs / 1000);
}
