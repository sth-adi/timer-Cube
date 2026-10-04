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
