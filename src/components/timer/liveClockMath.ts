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
