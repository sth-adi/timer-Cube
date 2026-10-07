import { slerpQuat, type Quat } from "./orientation";

/**
 * Display smoothing for the live Gyro Twin. A cube streams its orientation at
 * ~20-30 Hz, so drawing each sample as it lands looks steppy; instead the
 * drawn pose chases the latest sample a fraction of the way each frame.
 * Purely cosmetic — the samples themselves (and the rotation tracker fed from
 * them) are untouched.
 */

/** Fraction of the remaining rotation closed per frame at 60 fps. */
export const SMOOTH_PER_FRAME = 0.3;
const REFERENCE_FRAME_MS = 1000 / 60;
/** Closer than this (degrees) is "there": snap onto the target and stop animating. */
export const SETTLE_EPSILON_DEG = 0.15;

/**
 * The slerp factor for a frame that took `dtMs`, so the chase looks the same
 * at 30, 60 or 144 fps: closing 30% per 16.7ms frame means closing
 * 1 - 0.7^(dt/16.7) of the gap over any other frame length.
 */
export function smoothingFactor(dtMs: number, perFrame = SMOOTH_PER_FRAME): number {
  if (!(dtMs > 0)) return 0;
  const keep = Math.pow(1 - Math.min(0.999, Math.max(0, perFrame)), dtMs / REFERENCE_FRAME_MS);
  return Math.min(1, Math.max(0, 1 - keep));
}

/** Angle (degrees) of the shortest rotation between two unit quaternions. */
export function quatAngleDeg(a: Quat, b: Quat): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

export interface SmoothStep {
  q: Quat;
  /** True once the drawn pose has reached the target, so the caller can stop its frame loop. */
  settled: boolean;
}

/**
 * One frame of the chase: `current` moved toward `target` by the
 * framerate-independent factor for `dtMs`. When the change would be
 * negligible it lands exactly on the target and reports settled, so an idle
 * cube costs no frames.
 */
export function stepToward(current: Quat, target: Quat, dtMs: number, perFrame = SMOOTH_PER_FRAME): SmoothStep {
  if (quatAngleDeg(current, target) < SETTLE_EPSILON_DEG) return { q: target, settled: true };
  const next = slerpQuat(current, target, smoothingFactor(dtMs, perFrame));
  if (quatAngleDeg(next, target) < SETTLE_EPSILON_DEG) return { q: target, settled: true };
  return { q: next, settled: false };
}

/** More changed stickers than this in one update is a re-sync (new scramble, whole-cube state load), not a turn worth pulsing. */
export const MAX_PULSED_STICKERS = 36;

/**
 * Indices (0..53) of the stickers that differ between two facelet strings —
 * after a turn, exactly the stickers on the turned layer that moved colour.
 * Empty when there is nothing to compare against, the strings aren't
 * comparable, or so much changed it was a re-sync rather than a turn.
 */
export function changedStickers(prev: string | null, next: string): number[] {
  if (!prev || prev.length !== next.length) return [];
  const out: number[] = [];
  for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) out.push(i);
  return out.length > MAX_PULSED_STICKERS ? [] : out;
}

/* ---------- A critically damped spring on orientation ----------
 *
 * Chasing each new sample a fixed fraction per frame (stepToward) moves the pose in a burst after every
 * sample and nearly stops before the next one — at 20 samples a second that reads as 20 fps stop-motion.
 * A spring has momentum: the pose keeps gliding between samples and its speed never jumps, so the
 * motion is continuous at any frame rate. Critically damped, so it never overshoots the target.
 */

export interface SpringPose {
  q: Quat;
  /** Angular velocity in rad/s, in the world frame (axis × speed). */
  w: readonly [number, number, number];
}

/** Natural frequency, rad/s. ~100–150 ms to close a gap; a lower value is smoother but lags the cube more. */
export const SPRING_OMEGA = 26;
/** Integrate in steps no longer than this (ms) so the spring stays stable at any frame length. */
const MAX_SUBSTEP_MS = 8;
/** Within this angle (deg) and speed (deg/s) of the target the spring is at rest. */
export const SPRING_REST_DEG = 0.05;
export const SPRING_REST_DEG_PER_S = 0.5;

const mulQ = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
const conjQ = (a: Quat): Quat => ({ w: a.w, x: -a.x, y: -a.y, z: -a.z });
const normQ = (a: Quat): Quat => {
  const n = Math.hypot(a.x, a.y, a.z, a.w) || 1;
  return { w: a.w / n, x: a.x / n, y: a.y / n, z: a.z / n };
};

/** The rotation that takes `from` to `to` (shortest way), as a rotation vector: axis × angle (rad). */
export function rotationVector(from: Quat, to: Quat): [number, number, number] {
  let d = mulQ(to, conjQ(from));
  if (d.w < 0) d = { w: -d.w, x: -d.x, y: -d.y, z: -d.z };
  const s = Math.hypot(d.x, d.y, d.z);
  if (s < 1e-9) return [0, 0, 0];
  const angle = 2 * Math.atan2(s, d.w);
  const k = angle / s;
  return [d.x * k, d.y * k, d.z * k];
}

function expVector(v: readonly [number, number, number]): Quat {
  const angle = Math.hypot(v[0], v[1], v[2]);
  if (angle < 1e-12) return { w: 1, x: 0, y: 0, z: 0 };
  const s = Math.sin(angle / 2) / angle;
  return { w: Math.cos(angle / 2), x: v[0] * s, y: v[1] * s, z: v[2] * s };
}

export function springAtRest(pose: SpringPose, target: Quat): boolean {
  const e = rotationVector(pose.q, target);
  const err = (Math.hypot(e[0], e[1], e[2]) * 180) / Math.PI;
  const speed = (Math.hypot(pose.w[0], pose.w[1], pose.w[2]) * 180) / Math.PI;
  return err < SPRING_REST_DEG && speed < SPRING_REST_DEG_PER_S;
}

/**
 * One frame of the spring: `pose` moved toward `target` over `dtMs`. Returns the new pose and whether it
 * has come to rest on the target (the caller can stop animating). A pose at rest lands exactly on the target.
 */
export function springStep(pose: SpringPose, target: Quat, dtMs: number, omega = SPRING_OMEGA): SpringPose & { settled: boolean } {
  let { q } = pose;
  let [wx, wy, wz] = pose.w;
  let left = Math.min(100, Math.max(0, dtMs));
  while (left > 1e-6) {
    const h = Math.min(MAX_SUBSTEP_MS, left) / 1000;
    left -= MAX_SUBSTEP_MS;
    const e = rotationVector(q, target);
    // Critically damped: acceleration = ω²·error − 2ω·velocity.
    wx += (omega * omega * e[0] - 2 * omega * wx) * h;
    wy += (omega * omega * e[1] - 2 * omega * wy) * h;
    wz += (omega * omega * e[2] - 2 * omega * wz) * h;
    q = normQ(mulQ(expVector([wx * h, wy * h, wz * h]), q));
  }
  const next: SpringPose = { q, w: [wx, wy, wz] };
  if (springAtRest(next, target)) return { q: target, w: [0, 0, 0], settled: true };
  return { ...next, settled: false };
}
