import { HOME_ORIENTATION, axisRotation, matToQuat, mul, quatToMat, type Quat } from "@/lib/gyro/orientation";
import { applyMove, parseMove, type MoveSpec } from "@/lib/cube-engine/stickerTurns";
import type { Lean } from "./replayCamera";
import { activeLeaf, type ReplayTimeline } from "./replayTiming";

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

/** The cube half-way through a double turn: `before` (the facelets ahead of the move) with one quarter of the double's face turned. */
export function halfwayFacelets(before: string, token: string): string {
  return applyMove(before, token[0]);
}

export interface StageState {
  /** The move the position is in or just past (-1 before the first). */
  k: number;
  facelets: string;
  /** The turn being drawn and how far along it is, or null when the cube is still. */
  turning: { turn: MoveSpec; progress: number } | null;
}

/**
 * Exactly what the stage cube shows at `pos`: the cube after the moves before it, plus the turn in progress.
 * A double turn recorded as two quarters (`halves[k]`) shows the first quarter turning in its window, the half-way
 * cube between the windows, then the second quarter, and the cube after the double once it ends.
 */
export function stageStateAt(a: {
  tokens: readonly string[];
  starts: readonly number[];
  ends: readonly number[];
  halves?: ReplayTimeline["halves"];
  faceletsAfter: readonly string[];
  pos: number;
  /** The cube half-way through double `k`; memoise it, this is called every frame. */
  halfway?: (k: number) => string;
}): StageState {
  const { tokens, starts, ends, halves, faceletsAfter, pos } = a;
  const k = starts.length ? activeLeaf(starts, pos) : -1;
  const after = (i: number) => faceletsAfter[Math.min(faceletsAfter.length - 1, Math.max(0, i))] ?? faceletsAfter[0];
  if (k < 0) return { k, facelets: after(0), turning: null };
  const token = tokens[k] ?? "";
  const h = halves?.[k];
  if (h) {
    const quarter = parseMove(token[0]);
    if (quarter) {
      const mid = a.halfway ? a.halfway(k) : halfwayFacelets(after(k), token);
      const span = (from: number, to: number) => (to > from ? Math.max(0, (pos - from) / (to - from)) : 1);
      if (pos < h.firstEnd) return { k, facelets: after(k), turning: { turn: quarter, progress: span(h.firstStart, h.firstEnd) } };
      if (pos < h.secondStart) return { k, facelets: mid, turning: null };
      if (pos < h.secondEnd) return { k, facelets: mid, turning: { turn: quarter, progress: span(h.secondStart, h.secondEnd) } };
      return { k, facelets: after(k + 1), turning: null };
    }
  }
  const turn = parseMove(token);
  const spanMs = (ends[k] ?? 0) - (starts[k] ?? 0);
  const progress = turn && spanMs > 0 ? (pos - starts[k]) / spanMs : 1;
  if (turn && progress < 1) return { k, facelets: after(k), turning: { turn, progress: Math.max(0, progress) } };
  return { k, facelets: after(k + 1), turning: null };
}

export interface TurnSoundPlan {
  speed: number;
  durationMs: number;
}

/** What to tell the sound engine for move `k`, or null to skip it (the last click was too recent, in real time). */
export function planTurnSound(args: {
  starts: readonly number[];
  ends: readonly number[];
  k: number;
  speed: number;
  sinceLastMs: number;
  /** A double turn played as two quarters: `part` 0 is the first click, 1 the second, each timed by its own quarter. */
  halves?: ReplayTimeline["halves"];
  part?: 0 | 1;
}): TurnSoundPlan | null {
  const { starts, ends, k, speed, sinceLastMs } = args;
  if (sinceLastMs < minClickGapMs(speed)) return null;
  const h = args.halves?.[k];
  const span = h ? (args.part === 1 ? h.secondEnd - h.secondStart : h.firstEnd - h.firstStart) : (ends[k] ?? 0) - (starts[k] ?? 0);
  const real = span / Math.max(0.5, speed);
  return { speed: turnsPerSecond(starts, k, speed), durationMs: Math.min(160, Math.max(40, real)) };
}
