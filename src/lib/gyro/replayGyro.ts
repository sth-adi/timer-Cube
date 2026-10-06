import { slerpQuat, type Quat } from "./orientation";
import type { GyroStreamData } from "./solveGyro";

const quatAt = (s: GyroStreamData, i: number): Quat => ({ x: s.qx[i], y: s.qy[i], z: s.qz[i], w: s.qw[i] });

/**
 * The cube's recorded orientation `t` ms into the solve: slerped between the samples either side
 * of it, and held at the first/last sample outside the stream's range. Null for an empty stream.
 */
export function streamQuatAt(stream: GyroStreamData | null | undefined, t: number): Quat | null {
  const n = stream?.atMs.length ?? 0;
  if (!stream || n === 0) return null;
  if (t <= stream.atMs[0]) return quatAt(stream, 0);
  if (t >= stream.atMs[n - 1]) return quatAt(stream, n - 1);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (stream.atMs[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = stream.atMs[lo];
  const t1 = stream.atMs[hi];
  return slerpQuat(quatAt(stream, lo), quatAt(stream, hi), t1 > t0 ? (t - t0) / (t1 - t0) : 0);
}

/**
 * How far into the solve (real ms) a replay is when it sits `positionMs` into its own timeline.
 * The replay squeezes long pauses and gives every turn a fixed length, so its clock isn't the
 * solve's: each move's start on the replay maps to when that move was really made, and the
 * stretches between are interpolated. Before the first move and after the last it runs at 1:1.
 * `moveMs` is when each move was made, ms from the solve's start, one per entry of `starts`.
 */
export function solveMsAtPosition(starts: readonly number[], moveMs: readonly number[], positionMs: number): number {
  const n = Math.min(starts.length, moveMs.length);
  if (n === 0) return Math.max(0, positionMs);
  if (positionMs <= starts[0]) return Math.max(0, moveMs[0] + (positionMs - starts[0]));
  if (positionMs >= starts[n - 1]) return moveMs[n - 1] + (positionMs - starts[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= positionMs) lo = mid;
    else hi = mid;
  }
  const span = starts[hi] - starts[lo];
  return span > 0 ? moveMs[lo] + ((positionMs - starts[lo]) / span) * (moveMs[hi] - moveMs[lo]) : moveMs[lo];
}
