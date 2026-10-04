/**
 * The pure arithmetic behind the smart-cube timer's live readouts, kept apart from the React
 * pieces in liveClock.tsx so it can be tested without a browser.
 */

/**
 * Elapsed ms of a solve that is still running. `nowMs` and the cube's own event timestamps share
 * one performance.now() clock (see SmartCubeMove), so they compare directly. `nowMs` is 0 until
 * the first animation frame lands, and the max() covers a frame that fires just before a render
 * sees a move that already arrived a hair later.
 */
export function liveElapsedMs(nowMs: number, startedAtMs: number | null, lastMoveMs: number): number {
  const start = startedAtMs ?? 0;
  return nowMs > 0 ? Math.max(nowMs - start, lastMoveMs - start) : lastMoveMs - start;
}

/** The 15s WCA inspection window, repeated here so this file stays free of imports (same value as timerMachine's INSPECTION_MS). */
const INSPECTION_WINDOW_MS = 15_000;

/** Ms of inspection left `elapsedMs` after it began, never below 0. */
export function inspectionRemainingFor(elapsedMs: number): number {
  return Math.max(0, INSPECTION_WINDOW_MS - Math.max(0, elapsedMs));
}

/**
 * Whole seconds of inspection left, rounded up — the number on the digits. This is all the flow
 * hook keeps in React state, so the screen re-renders once a second, not once a frame. Every
 * threshold the app compares against (the 8s/12s beeps and calls at 7000/3000 ms left, the
 * "N s" readouts) sits on a whole second, so `remaining <= k * 1000` holds for this exactly when it
 * holds for the exact value.
 */
export function inspectionSecondsLeft(elapsedMs: number): number {
  return Math.ceil(inspectionRemainingFor(elapsedMs) / 1000);
}

/**
 * The exact inspection time left at animation-frame time `nowMs` (performance.now(), like
 * `startedAtMs`) — what the ring and the digit styling follow frame by frame. Before the first
 * frame lands (`nowMs` 0) or with no start, it is `fallbackMs`, the whole-second value the flow
 * already holds.
 */
export function inspectionRemainingAt(nowMs: number, startedAtMs: number | null, fallbackMs: number): number {
  if (nowMs <= 0 || startedAtMs === null) return fallbackMs;
  return inspectionRemainingFor(nowMs - startedAtMs);
}
