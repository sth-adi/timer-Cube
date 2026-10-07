import type { GyroStreamData } from "@/lib/gyro/solveGyro";

/**
 * The recorded gyro stream is thinned to ~20 Hz, so playing it back with
 * plain interpolation moves the camera in visible straight-line steps. A
 * ViewTrack is the same orientation, resampled on a fixed 60 Hz grid and
 * smoothed forwards AND backwards (zero lag: the cube is never late to a
 * regrip, it just arrives without corners). Looking one up is O(1) and
 * writes into a caller-owned buffer, so it is free to call every frame.
 */

export const TRACK_STEP_MS = 1000 / 60;
/** Smoothing time constant; short enough that a real regrip still reads as quick. */
export const TRACK_TAU_MS = 70;

export interface ViewTrack {
  /** Time of sample 0, ms from solve start. */
  startMs: number;
  stepMs: number;
  count: number;
  /** x, y, z, w per sample — unit quaternions, all in one hemisphere (no sign flips between neighbours). */
  q: Float64Array;
}

/** Linear blend of two quaternions (sign-aligned), normalised — what both the smoothing and the lookup use. */
function nlerpInto(out: Float64Array, o: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, t: number): void {
  let dot = a[ao] * b[bo] + a[ao + 1] * b[bo + 1] + a[ao + 2] * b[bo + 2] + a[ao + 3] * b[bo + 3];
  const sb = dot < 0 ? -1 : 1;
  const s0 = 1 - t;
  const s1 = t * sb;
  const x = s0 * a[ao] + s1 * b[bo];
  const y = s0 * a[ao + 1] + s1 * b[bo + 1];
  const z = s0 * a[ao + 2] + s1 * b[bo + 2];
  const w = s0 * a[ao + 3] + s1 * b[bo + 3];
  dot = Math.hypot(x, y, z, w) || 1;
  out[o] = x / dot;
  out[o + 1] = y / dot;
  out[o + 2] = z / dot;
  out[o + 3] = w / dot;
}

/** Orientation of the raw stream at `t`: normalised blend between the two samples either side, held at the ends. */
function rawAt(stream: GyroStreamData, t: number, out: Float64Array): void {
  const n = stream.atMs.length;
  let i = 0;
  if (t >= stream.atMs[n - 1]) i = n - 2;
  else if (t > stream.atMs[0]) {
    // Streams are a few hundred samples at most, and we only sweep forwards while resampling, so a scan is cheap.
    while (i < n - 2 && stream.atMs[i + 1] < t) i++;
  }
  const t0 = stream.atMs[i];
  const t1 = stream.atMs[i + 1];
  const frac = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = new Float64Array([stream.qx[i], stream.qy[i], stream.qz[i], stream.qw[i]]);
  const b = new Float64Array([stream.qx[i + 1], stream.qy[i + 1], stream.qz[i + 1], stream.qw[i + 1]]);
  nlerpInto(out, 0, a, 0, b, 0, frac);
}

/** Builds the smoothed track for a stream. Needs at least two samples; returns null otherwise. */
export function buildViewTrack(stream: GyroStreamData, tauMs = TRACK_TAU_MS): ViewTrack | null {
  const n = stream.atMs.length;
  if (n < 2) return null;
  const startMs = stream.atMs[0];
  const span = stream.atMs[n - 1] - startMs;
  const count = Math.max(2, Math.ceil(span / TRACK_STEP_MS) + 1);
  const raw = new Float64Array(count * 4);
  const tmp = new Float64Array(4);
  for (let k = 0; k < count; k++) {
    rawAt(stream, startMs + k * TRACK_STEP_MS, tmp);
    // Keep every neighbour in the same hemisphere so the filters never average across a sign flip.
    if (k > 0 && tmp[0] * raw[(k - 1) * 4] + tmp[1] * raw[(k - 1) * 4 + 1] + tmp[2] * raw[(k - 1) * 4 + 2] + tmp[3] * raw[(k - 1) * 4 + 3] < 0) {
      for (let c = 0; c < 4; c++) tmp[c] = -tmp[c];
    }
    raw.set(tmp, k * 4);
  }
  const alpha = 1 - Math.exp(-TRACK_STEP_MS / Math.max(1, tauMs));
  const fwd = new Float64Array(raw);
  for (let k = 1; k < count; k++) nlerpInto(fwd, k * 4, fwd, (k - 1) * 4, raw, k * 4, alpha);
  const bwd = new Float64Array(raw);
  for (let k = count - 2; k >= 0; k--) nlerpInto(bwd, k * 4, bwd, (k + 1) * 4, raw, k * 4, alpha);
  const q = new Float64Array(count * 4);
  for (let k = 0; k < count; k++) nlerpInto(q, k * 4, fwd, k * 4, bwd, k * 4, 0.5);
  // The ends stay exactly where the cube really was, so the intro and outro hold the recorded pose.
  q.set(raw.subarray(0, 4), 0);
  q.set(raw.subarray((count - 1) * 4), (count - 1) * 4);
  return { startMs, stepMs: TRACK_STEP_MS, count, q };
}

/** The smoothed orientation at `t` ms (clamped to the track's ends), written into `out` as x, y, z, w. */
export function trackQuatInto(track: ViewTrack, t: number, out: Float64Array): void {
  const f = (t - track.startMs) / track.stepMs;
  if (!(f > 0)) {
    out[0] = track.q[0];
    out[1] = track.q[1];
    out[2] = track.q[2];
    out[3] = track.q[3];
    return;
  }
  const k = Math.floor(f);
  if (k >= track.count - 1) {
    const e = (track.count - 1) * 4;
    out[0] = track.q[e];
    out[1] = track.q[e + 1];
    out[2] = track.q[e + 2];
    out[3] = track.q[e + 3];
    return;
  }
  nlerpInto(out, 0, track.q, k * 4, track.q, (k + 1) * 4, f - k);
}

/** Rotation matrix (row-major, same convention as lib/gyro/orientation's quatToMat) of a quaternion, into `out`. */
export function quatToMatInto(out: Float64Array, q: ArrayLike<number>): void {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const x = q[0] / n;
  const y = q[1] / n;
  const z = q[2] / n;
  const w = q[3] / n;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y - z * w);
  out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w);
  out[7] = 2 * (y * z + x * w);
  out[8] = 1 - 2 * (x * x + y * y);
}

/** Blend of two quaternions into `out` (exported so the end card can ease the cube from its last grip to a presentation pose). */
export function blendQuatInto(out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number): void {
  nlerpInto(out, 0, a, 0, b, 0, t);
}
