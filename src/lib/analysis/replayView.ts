import { HOME_ORIENTATION, axisRotation, matToQuat, mul, quatToMat, type Quat } from "@/lib/gyro/orientation";
import type { Lean } from "./replayCamera";

/**
 * The pure parts of the stage cube's view and sound: how the cube is turned for the camera, and when a
 * turn makes a click. Nothing here touches the DOM.
 */

/** The cube when the solve has no recorded gyro: yellow on top, green toward the viewer (the white-cross-down hold). */
export const FIXED_VIEW: Quat = matToQuat(HOME_ORIENTATION);

/** How far the viewer may tip the cube by dragging (degrees up or down). */
export const ORBIT_PITCH_LIMIT = 60;

export interface Orbit {
  yaw: number;
  pitch: number;
}

/**
 * `base` (the recorded grip, or the fixed view) as the camera sees it: the camera lean swings the camera
 * (so turns the cube the other way), the viewer's drag turns the cube itself. Both are small rotations in
 * the viewer's frame, applied after the grip.
 */
export function viewOrientation(base: Quat, lean: Lean, orbit: Orbit): Quat {
  const yaw = orbit.yaw - lean.yaw;
  const pitch = Math.max(-ORBIT_PITCH_LIMIT, Math.min(ORBIT_PITCH_LIMIT, orbit.pitch + lean.pitch));
  if (Math.abs(yaw) < 1e-6 && Math.abs(pitch) < 1e-6) return base;
  return matToQuat(mul(mul(axisRotation("x", pitch), axisRotation("y", yaw)), quatToMat(base)));
}

/** Most turns per second the click engine is told about: past this a turn sounds no snappier. */
export const MAX_SOUND_TPS = 12;

/** Turns per second around move `k`, from the replay's own gaps (a window of a few moves either side), at playback `speed`. */
export function turnsPerSecond(starts: readonly number[], k: number, speed: number): number {
  const lo = Math.max(0, k - 2);
  const hi = Math.min(starts.length - 1, k + 2);
  const span = hi > lo ? starts[hi] - starts[lo] : 0;
  const tps = span > 0 ? ((hi - lo) / span) * 1000 * speed : 2;
  return Math.min(MAX_SOUND_TPS, Math.max(0.5, tps));
}

/** The least real time between two clicks: a quick run at 2x or 4x thins out instead of turning into a buzz. */
export function minClickGapMs(speed: number): number {
  return 45 * Math.pow(Math.max(0.5, speed), 0.85);
}

export interface TurnSoundPlan {
  speed: number;
  durationMs: number;
}

/** What to tell the sound engine for move `k`, or null to skip it (the last click was too recent, in real time). */
export function planTurnSound(args: { starts: readonly number[]; ends: readonly number[]; k: number; speed: number; sinceLastMs: number }): TurnSoundPlan | null {
  const { starts, ends, k, speed, sinceLastMs } = args;
  if (sinceLastMs < minClickGapMs(speed)) return null;
  const real = ((ends[k] ?? 0) - (starts[k] ?? 0)) / Math.max(0.5, speed);
  return { speed: turnsPerSecond(starts, k, speed), durationMs: Math.min(160, Math.max(40, real)) };
}
