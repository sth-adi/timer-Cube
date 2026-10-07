/**
 * The pure maths behind `useSmoothedValue`: a critically damped scalar spring that eases a drawn
 * indicator (a progress fill, a ring, a rate readout) toward the value it should show, so a jump in
 * that value glides instead of stepping. Display smoothing only: never feed a clock's own digits
 * through it, those must show the true elapsed time.
 *
 * The drawn value is `target + e`: `e` is how far the drawing still trails the target and `v` how
 * fast that gap is closing. Keeping the gap (rather than the drawn value) as the state is what lets a
 * target that merely grows frame by frame (a bar tracking the clock) be drawn exactly, with no lag at
 * all, while a target that jumps starts a gap that then eases away.
 */

export interface SpringState {
  /** Drawn value minus target. */
  e: number;
  /** Rate of change of that gap, per second. */
  v: number;
}

export const SPRING_REST: SpringState = { e: 0, v: 0 };

/** Natural frequency (rad/s) of the default ease: the gap is about 98% closed after ~4/omega (~0.25s at 16). */
export const SMOOTH_OMEGA = 16;

/** A frame longer than this (a backgrounded tab coming back) is treated as this long; the ease just finishes. */
const MAX_DT_MS = 250;
/** The gap and its speed below which the drawing is "there". Relative to the value's own scale. */
const REST_E = 1e-3;
const REST_V = 1e-2;

/**
 * One frame of the ease, in closed form, so the path is the same at 30, 60 or 144 fps (no
 * integration error and no per-frame tuning). Critically damped, so it never overshoots from rest.
 * Returns SPRING_REST itself once it has settled, which is how a caller knows to stop its frame loop.
 */
export function criticallyDampedStep(state: SpringState, dtMs: number, omega: number = SMOOTH_OMEGA, scale = 1): SpringState {
  if (state.e === 0 && state.v === 0) return state;
  const t = (Number.isFinite(dtMs) ? Math.min(MAX_DT_MS, Math.max(0, dtMs)) : 0) / 1000;
  const decay = Math.exp(-omega * t);
  const c = state.v + omega * state.e;
  const e = (state.e + c * t) * decay;
  const v = (state.v - omega * c * t) * decay;
  if (!Number.isFinite(e) || !Number.isFinite(v)) return SPRING_REST;
  if (Math.abs(e) < REST_E * scale && Math.abs(v) < REST_V * scale) return SPRING_REST;
  return { e, v };
}

/**
 * The target just moved from `prev` to `next`. A small move (at most `jumpAbove`) is the ordinary
 * frame-to-frame growth of a live value and is followed exactly: the gap is left alone. A bigger move
 * is a jump: the gap absorbs it so the drawing starts from where it was and eases across. With
 * `jumpAbove` 0 every change is eased, which is right for a value that is itself a noisy signal.
 */
export function absorbTargetChange(state: SpringState, prev: number, next: number, jumpAbove: number): SpringState {
  const delta = next - prev;
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) <= jumpAbove) return state;
  return { e: state.e - delta, v: state.v };
}

/** The value to draw for `target` with the ease in the given state, clamped to the range the indicator can show. */
export function smoothedValue(target: number, state: SpringState, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, target + state.e));
}
