import type { Quat } from "./orientation";
import { rotationVector } from "./smooth";

/**
 * Short look-ahead for the live gyro twin. The cube streams ~20-30 samples a second and the drawn pose chases the
 * latest one with a spring, so it always trails the real cube by a bit. Nudging the target a few tens of milliseconds
 * along the angular velocity of the last two samples hides most of that lag. Kept gentle: clamped, and off whenever the
 * stream is stale (the cube stopped, or a sample was dropped) so it never keeps spinning on old information.
 */

export interface TimedQuat {
  q: Quat;
  atMs: number;
}

export interface PredictOptions {
  /** how far ahead to aim (ms) */
  leadMs?: number;
  /** the stream counts as stale when the newest sample is older than this (ms) */
  staleMs?: number;
  /** never aim further than this many degrees past the newest sample */
  maxLeadDeg?: number;
  /** samples closer together than this (ms) give a noisy velocity and are not used */
  minGapMs?: number;
  /** samples further apart than this (ms) say nothing about the current speed */
  maxGapMs?: number;
}

export const PREDICT_LEAD_MS = 50;
export const PREDICT_STALE_MS = 150;
export const PREDICT_MAX_LEAD_DEG = 20;

function expVector(v: readonly [number, number, number]): Quat {
  const angle = Math.hypot(v[0], v[1], v[2]);
  if (angle < 1e-12) return { w: 1, x: 0, y: 0, z: 0 };
  const s = Math.sin(angle / 2) / angle;
  return { w: Math.cos(angle / 2), x: v[0] * s, y: v[1] * s, z: v[2] * s };
}

function mul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/**
 * The orientation to aim the spring at: `last` carried forward by its angular velocity (from `prev` to `last`) for
 * `leadMs`. Returns `last.q` itself when there is nothing to extrapolate from, the stream is stale at `nowMs`,
 * `enabled` is false (reduced motion), or the samples are too close or too far apart to give a trustworthy speed.
 */
export function predictOrientation(prev: TimedQuat | null, last: TimedQuat, nowMs: number, enabled = true, opts: PredictOptions = {}): Quat {
  const { leadMs = PREDICT_LEAD_MS, staleMs = PREDICT_STALE_MS, maxLeadDeg = PREDICT_MAX_LEAD_DEG, minGapMs = 4, maxGapMs = 200 } = opts;
  if (!enabled || !prev) return last.q;
  const gap = last.atMs - prev.atMs;
  if (!(gap >= minGapMs) || gap > maxGapMs) return last.q;
  if (nowMs - last.atMs > staleMs) return last.q;
  const rv = rotationVector(prev.q, last.q);
  const per = leadMs / gap;
  let v: [number, number, number] = [rv[0] * per, rv[1] * per, rv[2] * per];
  const angle = Math.hypot(v[0], v[1], v[2]);
  const cap = (maxLeadDeg * Math.PI) / 180;
  if (angle > cap) v = [(v[0] * cap) / angle, (v[1] * cap) / angle, (v[2] * cap) / angle];
  if (angle < 1e-6) return last.q;
  const out = mul(expVector(v), last.q);
  const n = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  return { x: out.x / n, y: out.y / n, z: out.z / n, w: out.w / n };
}
