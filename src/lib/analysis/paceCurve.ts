import { remapPosition, type ReplayTimeline } from "./replayTiming";

/**
 * The solve's pace as a curve under the replay scrubber: turns per second, smoothed, plus the long
 * pauses. The curve is laid out on the scrubber's own timeline (`shown`), so a pause the replay
 * shortens still gets its dip, drawn where the scrubber is, while the pace itself is always read from
 * the solve's real timing (`real`, the same moves with every gap kept).
 */

/** How wide a turn's smudge is on the curve: about a turn's worth of context either side. */
export const PACE_SIGMA_MS = 450;
/** An idle stretch at least this long before a move counts as a pause worth marking. */
export const PAUSE_MIN_MS = 800;
/** The curve is never scaled to less than this, so a slow, even solve doesn't read as a mountain range. */
export const PACE_MIN_SCALE_TPS = 3;
export const PACE_BINS = 96;

export interface PacePause {
  /** Where the pause sits on the scrubber, 0..1. */
  startFrac: number;
  endFrac: number;
  /** How long it really was. */
  ms: number;
}

export interface PaceCurve {
  /** Turns per second at the middle of each of the evenly spaced bins across the scrubber. */
  values: number[];
  peakTps: number;
  /** What the curve's full height stands for (peakTps, but never under PACE_MIN_SCALE_TPS). */
  scaleTps: number;
  pauses: PacePause[];
}

/**
 * The curve for a replay. `real` and `shown` must be built from the same moves (see buildTimeline);
 * pass the same timeline twice when the scrubber already shows true timing. Null when there is
 * nothing worth drawing (fewer than a handful of moves, or no duration).
 */
export function buildPaceCurve(real: ReplayTimeline, shown: ReplayTimeline, bins = PACE_BINS): PaceCurve | null {
  const n = real.starts.length;
  if (n < 6 || n !== shown.starts.length || real.durationMs <= 0 || shown.durationMs <= 0) return null;
  const mids = real.starts.map((s, i) => (s + real.ends[i]) / 2);
  const norm = 1000 / (PACE_SIGMA_MS * Math.sqrt(2 * Math.PI));
  const reach = PACE_SIGMA_MS * 3;
  const values: number[] = [];
  let lo = 0;
  for (let j = 0; j < bins; j++) {
    const x = ((j + 0.5) / bins) * shown.durationMs;
    const r = shown === real ? x : remapPosition(x, shown, real);
    while (lo < n && mids[lo] < r - reach) lo++;
    let sum = 0;
    for (let i = lo; i < n && mids[i] <= r + reach; i++) {
      const d = (mids[i] - r) / PACE_SIGMA_MS;
      sum += Math.exp(-0.5 * d * d);
    }
    values.push(sum * norm);
  }
  const peakTps = Math.max(...values);

  const pauses: PacePause[] = [];
  for (let i = 0; i < n; i++) {
    const realFrom = i > 0 ? real.ends[i - 1] : 0;
    const idle = real.starts[i] - realFrom;
    if (idle < PAUSE_MIN_MS) continue;
    const from = i > 0 ? shown.ends[i - 1] : 0;
    pauses.push({ startFrac: from / shown.durationMs, endFrac: shown.starts[i] / shown.durationMs, ms: idle });
  }
  return { values, peakTps, scaleTps: Math.max(peakTps, PACE_MIN_SCALE_TPS), pauses };
}

/** The pace at a point on the scrubber (0..1), and the pause it falls in, if any. */
export function paceAt(curve: PaceCurve, frac: number): { tps: number; pause: PacePause | null } {
  const f = Math.min(1, Math.max(0, frac));
  const x = f * curve.values.length - 0.5;
  const i = Math.min(curve.values.length - 1, Math.max(0, Math.floor(x)));
  const j = Math.min(curve.values.length - 1, i + 1);
  const t = Math.min(1, Math.max(0, x - i));
  const tps = curve.values[i] * (1 - t) + curve.values[j] * t;
  const pause = curve.pauses.find((p) => f >= p.startFrac && f <= p.endFrac) ?? null;
  return { tps, pause };
}

/**
 * The curve as an SVG path in a `width` x `height` box (y grows downward): a closed area from the
 * baseline up through every bin, so the same string draws the fill and, clipped, the part already played.
 */
export function paceAreaPath(curve: PaceCurve, width: number, height: number): string {
  const n = curve.values.length;
  const pts = curve.values.map((v, i) => {
    const x = (i / (n - 1)) * width;
    const y = height - Math.min(1, v / curve.scaleTps) * height;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M0 ${height} L${pts.join(" L")} L${width} ${height} Z`;
}

/** Just the top edge of `paceAreaPath`, for the line. */
export function paceLinePath(curve: PaceCurve, width: number, height: number): string {
  const n = curve.values.length;
  return `M${curve.values
    .map((v, i) => `${((i / (n - 1)) * width).toFixed(2)} ${(height - Math.min(1, v / curve.scaleTps) * height).toFixed(2)}`)
    .join(" L")}`;
}
