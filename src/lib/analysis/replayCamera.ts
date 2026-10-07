import { CUBE_ORIENTATIONS, FACE_NORMALS, HOME_ORIENTATION, mul, quatToMat, snapOrientation, transpose, type Quat } from "@/lib/gyro/orientation";

/**
 * The replay camera's gentle sway: it leans a few degrees toward the face that is being turned, and
 * (where a gyro stream was recorded) a little way after the cube's real tilt. Pure maths, so the
 * 3D player, the CSS twins and the reel's canvas camera can all read the same easing.
 *
 * A `Lean` is a camera offset in degrees, from the viewer's side: `yaw` > 0 swings the camera toward
 * the right of the cube, `pitch` > 0 raises it. The lean at any moment is a function of the replay
 * position alone (no history), so scrubbing back and forth always shows the same camera.
 */
export interface Lean {
  yaw: number;
  pitch: number;
}

export const NO_LEAN: Lean = { yaw: 0, pitch: 0 };

/** How far one turn swings the camera at its peak (several quick turns add up, then soft-limit). */
export const TURN_LEAN_DEG = 5;
/** Nothing the face lean does ever goes past this. */
export const MAX_LEAN_DEG = 8;
/** A turn pulls the camera in over this long from its start... */
export const LEAN_RISE_MS = 180;
/** ...holds for this long after it ends... */
export const LEAN_HOLD_MS = 220;
/** ...and lets go over this long, so the camera is back at rest well within a second of the last turn. */
export const LEAN_FALL_MS = 650;

/** The share of the cube's recorded tilt the camera copies, and the most it ever follows. */
export const GYRO_FOLLOW = 0.5;
export const MAX_GYRO_DEG = 12;

const IDENTITY: ArrayLike<number> = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const DEG = 180 / Math.PI;

let motionQuery: MediaQueryList | null | undefined;

/** The camera sways only when motion is welcome: not under prefers-reduced-motion, not with effects off (`data-fx-level="off"`). Always true off the browser. */
export function cameraMotionAllowed(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (motionQuery === undefined) {
    try {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      motionQuery = null;
    }
  }
  if (motionQuery?.matches) return false;
  return document.documentElement.dataset.fxLevel !== "off";
}

/** The face a turn token turns (U, D, L, R, F, B — wide turns count as their face), or null for slices and rotations. */
export function faceOfToken(token: string): keyof typeof FACE_NORMALS | null {
  const c = token.trim()[0];
  if (!c || !"UDLRFBudlrfb".includes(c)) return null;
  return c.toUpperCase() as keyof typeof FACE_NORMALS;
}

/** One face turn, as the replay lays it out: when it begins and ends, and the outward normal of the face in the cube's own frame. */
export interface LeanTurn {
  start: number;
  end: number;
  n: readonly [number, number, number];
}

/** The face turns among `tokens` (one per entry of `starts`/`ends`), in time order. */
export function buildLeanTurns(tokens: readonly string[], starts: readonly number[], ends: readonly number[]): LeanTurn[] {
  const out: LeanTurn[] = [];
  const n = Math.min(tokens.length, starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const face = faceOfToken(tokens[i]);
    if (face) out.push({ start: starts[i], end: ends[i], n: FACE_NORMALS[face] });
  }
  return out;
}

const smooth = (x: number) => {
  const c = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};
const softLimit = (x: number, max: number) => max * Math.tanh(x / max);

/**
 * The camera lean `posMs` into the replay. Each recent turn pulls the camera toward its face (a face
 * on the right pulls right, one on top pulls up, the front pulls toward the middle, the back round
 * to the right), easing in as the turn starts and out after it ends. `grip` is the cube's
 * body → viewer rotation (row-major 3x3), so a face is pulled toward where it actually is on screen;
 * leave it out when the cube is drawn in its own frame.
 */
export function leanAt(turns: readonly LeanTurn[], posMs: number, grip: ArrayLike<number> = IDENTITY): Lean {
  let lo = 0;
  let hi = turns.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (turns[mid].start <= posMs) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  let yaw = 0;
  let pitch = 0;
  for (let i = last; i >= 0; i--) {
    const t = turns[i];
    const since = posMs - t.end;
    if (since > LEAN_HOLD_MS + LEAN_FALL_MS) break;
    const w = smooth((posMs - t.start) / LEAN_RISE_MS) * (1 - smooth((since - LEAN_HOLD_MS) / LEAN_FALL_MS));
    if (w <= 0) continue;
    const nx = grip[0] * t.n[0] + grip[1] * t.n[1] + grip[2] * t.n[2];
    const ny = grip[3] * t.n[0] + grip[4] * t.n[1] + grip[5] * t.n[2];
    const nz = grip[6] * t.n[0] + grip[7] * t.n[1] + grip[8] * t.n[2];
    yaw += w * (nx - nz);
    pitch += w * ny;
  }
  return { yaw: softLimit(yaw * TURN_LEAN_DEG, MAX_LEAN_DEG), pitch: softLimit(pitch * TURN_LEAN_DEG, MAX_LEAN_DEG) };
}

/**
 * How far to swing a 3D player's camera to copy the cube's recorded tilt `q` (body → viewer, as the
 * gyro stream stores it): the small wobble away from the nearest of the 24 whole-cube grips, so a
 * regrip (y, x') is never chased, only the lean around it. The player shows the cube the way the
 * solver saw it (yellow top, green front), so the cube's own yaw becomes the camera's, and its pitch
 * the opposite sense of the camera's.
 */
export function gyroLean(q: Quat): Lean {
  const away = mul(quatToMat(q), transpose(HOME_ORIENTATION));
  const grip = CUBE_ORIENTATIONS[snapOrientation(away).index];
  const r = mul(away, transpose(grip));
  const yaw = Math.atan2(r[2], r[8]) * DEG * GYRO_FOLLOW;
  const pitch = Math.asin(Math.max(-1, Math.min(1, r[5]))) * DEG * GYRO_FOLLOW;
  const cap = (x: number) => Math.max(-MAX_GYRO_DEG, Math.min(MAX_GYRO_DEG, x));
  return { yaw: cap(yaw), pitch: cap(pitch) };
}

export function addLean(a: Lean, b: Lean, weightB = 1): Lean {
  return { yaw: a.yaw + b.yaw * weightB, pitch: a.pitch + b.pitch * weightB };
}

/* ---------- Easing the camera toward its lean ---------- */

/** The camera as the screen draws it: where it is and how fast it is moving (degrees, degrees/s). */
export interface LeanSpring {
  yaw: number;
  pitch: number;
  vYaw: number;
  vPitch: number;
}

export const REST_SPRING: LeanSpring = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 };
/** Spring stiffness (rad/s): the camera closes most of a gap in about a third of a second, and never overshoots. */
export const LEAN_OMEGA = 8;
const SETTLE_DEG = 0.02;
const SETTLE_SPEED = 0.2;

function dampAxis(x: number, v: number, target: number, w: number, dt: number): [number, number] {
  const e = Math.exp(-w * dt);
  const d = x - target;
  const t = v + w * d;
  return [target + (d + t * dt) * e, (v - w * t * dt) * e];
}

/** One frame of a critically damped spring toward `target`, exact for any frame length. `settled` once it has arrived and stopped. */
export function stepLean(s: LeanSpring, target: Lean, dtMs: number, omega = LEAN_OMEGA): { spring: LeanSpring; settled: boolean } {
  const dt = Math.max(0, Math.min(0.1, dtMs / 1000));
  const [yaw, vYaw] = dampAxis(s.yaw, s.vYaw, target.yaw, omega, dt);
  const [pitch, vPitch] = dampAxis(s.pitch, s.vPitch, target.pitch, omega, dt);
  const settled =
    Math.abs(yaw - target.yaw) < SETTLE_DEG && Math.abs(pitch - target.pitch) < SETTLE_DEG && Math.abs(vYaw) < SETTLE_SPEED && Math.abs(vPitch) < SETTLE_SPEED;
  return settled ? { spring: { yaw: target.yaw, pitch: target.pitch, vYaw: 0, vPitch: 0 }, settled: true } : { spring: { yaw, pitch, vYaw, vPitch }, settled: false };
}
