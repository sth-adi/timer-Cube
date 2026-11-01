import { clamp01 } from "./draw";
import type { SoundCue } from "./highlights";
import type { ReelTimeline } from "./timeline";

/**
 * The pure maths behind the reel's TikTok polish: the staged inspection
 * orbit and the finish slow-mo ramp. No canvas in here, so it is all
 * unit-testable; the drawing lives in fx.ts and renderFrame.ts.
 */

// ───────────────────────────── inspection ─────────────────────────────

/** Share of the intro that the cube spends sitting still at the end, so the solve starts from a calm, readable pose. */
const INSPECT_REST = 0.18;

/**
 * Inspection isn't recorded, so the reel stages a short one: the camera
 * orbits the scrambled cube like a cuber turning it over to read it, then
 * settles. `p` runs 0..1 across the intro; the pose is (0, 0) with zero
 * velocity at both ends, so it never pops at the start or at GO.
 * Angles are in degrees, added to the standard camera's yaw and pitch.
 */
export function inspectionPose(p: number): { yaw: number; pitch: number } {
  const q = clamp01(p / (1 - INSPECT_REST));
  const s = Math.sin(Math.PI * q);
  return { yaw: 44 * Math.sin(2 * Math.PI * q) * s, pitch: 27 * s * s };
}

/** 0..1 across the intro (0 at the first frame, 1 at the solve's start). */
export function introProgress(t: number, introMs: number): number {
  return t >= 0 ? 1 : clamp01((t + introMs) / introMs);
}

// ───────────────────────────── finish slow-mo ramp ─────────────────────────────

/** From `at` ms into the solve, playback runs at `speed` (< 1) of real time. */
export interface Ramp {
  at: number;
  speed: number;
}

/** How slow the last moves play. Slow enough to feel, fast enough that the clock still reads as a sprint. */
export const RAMP_SPEED = 0.42;
/** How many of the final moves play in slow motion. */
const RAMP_MOVES = 3;

/** The ramp for a solve, or null when it is too short for one to read as anything but a stutter. */
export function rampFor(tl: Pick<ReelTimeline, "moves" | "timesMs" | "turnMs" | "totalMs">): Ramp | null {
  const n = tl.moves.length;
  if (n < 8 || tl.totalMs < 3000) return null;
  const i = n - RAMP_MOVES;
  const at = Math.max(0, tl.timesMs[i] - tl.turnMs[i]);
  return at > 0 && at < tl.totalMs ? { at, speed: RAMP_SPEED } : null;
}

/** Solve time `u` (ms) -> how far into the video it plays (ms, same origin). */
export function toReelMs(ramp: Ramp | null, u: number): number {
  return !ramp || u <= ramp.at ? u : ramp.at + (u - ramp.at) / ramp.speed;
}

/** The video clock `r` (ms) -> the solve time to draw. After the solve ends the end card runs at real speed. */
export function fromReelMs(ramp: Ramp | null, r: number, totalMs: number): number {
  if (!ramp || r <= ramp.at) return r;
  const end = toReelMs(ramp, totalMs);
  return r <= end ? ramp.at + (r - ramp.at) * ramp.speed : totalMs + (r - end);
}

/**
 * The soundtrack, re-timed to the ramp: every cue tied to the solve (turns,
 * the finish chime) moves with the picture; the beat and the cards stay on
 * the real clock. `introMs` is the intro length the cues were built with.
 */
export function warpCues(cues: readonly SoundCue[], introMs: number, ramp: Ramp | null): SoundCue[] {
  if (!ramp) return [...cues];
  return cues
    .map((c) => (c.kind === "turn" || c.kind === "finish" || c.kind === "pb" ? { ...c, atMs: introMs + toReelMs(ramp, c.atMs - introMs) } : c))
    .sort((a, b) => a.atMs - b.atMs);
}

// ───────────────────────────── per-frame pulses ─────────────────────────────

/** 1 at the instant a move lands, easing to 0 over `ms` (squared, so it snaps out and settles softly). */
export function pulseSince(landedAt: number | undefined, now: number, ms: number): number {
  if (landedAt === undefined) return 0;
  const k = 1 - clamp01((now - landedAt) / ms);
  return k * k;
}
