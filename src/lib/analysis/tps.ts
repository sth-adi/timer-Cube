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

/** Default effective window for the live readout: ~1.8s of recent turning, smoothed. */
export const LIVE_TPS_WINDOW_MS = 1800;
/** Below this the live readout is "at rest" — it would round to 0.0 anyway. */
const LIVE_TPS_REST = 0.05;
/** Early in a solve, don't divide by a sliver of history (the first move would read as a spike). */
const LIVE_TPS_MIN_SPAN_MS = 600;

/**
 * Turns per second "right now" — a live speedometer, distinct from
 * `computeTpsBuckets`' fixed windows aligned to the very first move (right for
 * a post-solve graph, wrong for a hand-speed readout that has to slide with
 * the clock).
 *
 * Counting integers in a 1s window made the readout hop 0, 1, 2 and show
 * "3.0" at every other glance, so this is a smoothed rate instead: every move
 * contributes a soft bump that rises over ~`windowMs/4`, peaks, and fades out
 * over `windowMs` — the result of running the move stream through two
 * cascaded exponential moving averages. It is evaluated in closed form from
 * the timestamps, so it is stateless (a pure function of `atMs`, nothing to
 * carry between frames) yet moves continuously: a move landing never steps the
 * number, and stopping decays it smoothly to 0. A steady stream of N turns per
 * second reads as N once the window has filled; the start of a solve is
 * normalised against the history there actually is, so the ramp-up isn't
 * artificially low-balled by a window that hasn't filled yet.
 */
export function rollingTps(timestampsMs: readonly number[], atMs: number, windowMs = LIVE_TPS_WINDOW_MS): number {
  const n = timestampsMs.length;
  if (n === 0 || windowMs <= 0) return 0;
  const tau = windowMs / 4;
  const reach = tau * 6; // beyond this a bump has faded to ~1% of its peak
  let sum = 0;
  // Timestamps ascend, so walk back from the newest and stop at the first one that's faded out.
  for (let i = n - 1; i >= 0; i--) {
    const age = atMs - timestampsMs[i];
    if (age < 0) continue;
    if (age > reach) break;
    const x = age / tau;
    sum += x * Math.exp(-x);
  }
  // What a steady stream would have accumulated over the history we actually have (<= reach).
  const span = Math.min(reach, Math.max(LIVE_TPS_MIN_SPAN_MS, atMs - timestampsMs[0]));
  const u = span / tau;
  const norm = 1 - Math.exp(-u) * (1 + u);
  return (1000 * sum) / tau / norm;
}

/** The live TPS as shown ("4.2"), or null at rest (nothing recent enough to read) — the caller renders its own placeholder. */
export function formatLiveTps(tps: number | null): string | null {
  return tps === null || !(tps >= LIVE_TPS_REST) ? null : tps.toFixed(1);
}
