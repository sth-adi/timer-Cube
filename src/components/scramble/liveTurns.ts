/**
 * Pure planning for CubeViewer's opt-in live mode (a cube mirrored move by
 * move): given what the player already shows and what it should show now,
 * decide between doing nothing, animating the newest turn on top of an
 * incrementally-extended setup, or rebuilding the whole setup.
 *
 * Kept free of cubing.js / DOM so the rules are unit-testable.
 */

export interface LiveSnapshot {
  /** The setup alg the moves sit on top of (the scramble). */
  setup: string;
  /** Every move so far, in order. */
  tokens: readonly string[];
}

export interface LivePlanContext {
  /** A monotonic clock reading (performance.now()), passed in so the planner stays pure. */
  nowMs: number;
  /** When the last animated turn started on the same clock; -Infinity when none. */
  lastAnimMs: number;
  reducedMotion: boolean;
}

export type LivePlan =
  /** Nothing changed. */
  | { kind: "none" }
  /** Rebuild the whole position from setup + every token (first show, reset, correction, rewind, new scramble). */
  | { kind: "snap" }
  /** Moves were only appended: `added` are the new tokens. When `animate`, all but the last are applied silently and the last one plays. */
  | { kind: "append"; added: readonly string[]; animate: boolean };

/**
 * Turns closer together than this are applied without an animation. At the
 * default ~80ms quarter-turn a faster stream could never finish drawing one
 * turn before the next arrives, so the cube would only ever show jittery
 * partial turns — snapping keeps it exactly at real time.
 */
export const MIN_ANIMATION_GAP_MS = 45;

/** True when `next` is `prev` with zero or more tokens added at the end. */
export function isAppendOnly(prev: readonly string[], next: readonly string[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) return false;
  return true;
}

export function planLiveUpdate(prev: LiveSnapshot | null, next: LiveSnapshot, ctx: LivePlanContext): LivePlan {
  if (!prev || prev.setup !== next.setup || !isAppendOnly(prev.tokens, next.tokens)) return { kind: "snap" };
  if (next.tokens.length === prev.tokens.length) return { kind: "none" };
  const added = next.tokens.slice(prev.tokens.length);
  const animate = !ctx.reducedMotion && ctx.nowMs - ctx.lastAnimMs >= MIN_ANIMATION_GAP_MS;
  return { kind: "append", added, animate };
}

/** CubeViewer's tempoScale for a quarter turn that should take `turnMs` (cubing.js plays one at 1000ms at tempo 1). */
export function tempoScaleFor(turnMs: number): number {
  return 1000 / Math.max(20, turnMs);
}
