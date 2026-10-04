import { quatAngleDeg } from "./smooth";
import type { GyroSample } from "./orientation";

/**
 * Where the gyro's "home" pose (yellow top, green front) comes from when a
 * connection starts. Every orientation, regrip name and oriented
 * reconstruction is measured against it, so a wrong one quietly skews all of
 * them until a manual Re-center.
 *
 * - A first connect (or one by hand): the first sample is home — the connect
 *   screen asks for that grip.
 * - The link came back on its own mid-session: the cube is probably in
 *   someone's hand at an arbitrary angle, but if the same cube was only gone
 *   a moment its IMU frame is still the one the saved reference was measured
 *   in, so the old reference is still right.
 * - Anything else (a different cube, or gone long enough to have napped and
 *   restarted its IMU): the old reference means nothing. Take a new one
 *   once the cube has been still for a moment, and flag it as unverified so
 *   the timer can offer a Re-center.
 */
export type GyroHomeDecision = "first-sample" | "keep" | "await-still";

/** A drop shorter than this is a Bluetooth glitch; longer, the cube may well have slept and restarted its IMU frame. */
export const GYRO_FRAME_PERSIST_MS = 30_000;

export interface GyroHomeInput {
  /** The connection came back on its own after a drop (not a fresh connect). */
  resumed: boolean;
  /** The store holds a home reference from before. */
  hasRef: boolean;
  /** The cube that came back is the one that dropped. */
  sameCube: boolean;
  /** How long the link was down, or null when unknown. */
  droppedForMs: number | null;
}

export function decideGyroHome({ resumed, hasRef, sameCube, droppedForMs }: GyroHomeInput): GyroHomeDecision {
  if (!resumed) return "first-sample";
  if (hasRef && sameCube && droppedForMs !== null && droppedForMs >= 0 && droppedForMs <= GYRO_FRAME_PERSIST_MS) return "keep";
  return "await-still";
}

/** Within this many degrees of where it was, the cube counts as held still. */
export const STILL_MAX_DRIFT_DEG = 3;
/** ...for this long. */
export const STILL_HOLD_MS = 400;

/**
 * Says when the cube has been held still: feed it each sample in order and
 * it returns true on the first one that completes STILL_HOLD_MS within
 * STILL_MAX_DRIFT_DEG of where the stillness began.
 */
export class StillnessDetector {
  private anchor: GyroSample | null = null;

  push(sample: GyroSample): boolean {
    if (!this.anchor || quatAngleDeg(this.anchor.q, sample.q) > STILL_MAX_DRIFT_DEG || sample.atMs < this.anchor.atMs) {
      this.anchor = sample;
      return false;
    }
    return sample.atMs - this.anchor.atMs >= STILL_HOLD_MS;
  }
}
