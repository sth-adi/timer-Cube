/** Per-move pace used when there's no real capture to pace against — a relaxed turn cadence. */
export const FALLBACK_GAP_MS = 280;

/**
 * Converts absolute per-move timestamps (ms from solve start, one entry per
 * move — see Solve.moveTimestamps) into consecutive gaps (ms since the
 * previous move, first gap measured from 0) — the shape TimedCubePlayer's
 * `gapsMs` prop wants.
 */
export function gapsFromTimestamps(moveTimestamps: readonly number[]): number[] {
  const gaps: number[] = [];
  let prev = 0;
  for (const t of moveTimestamps) {
    gaps.push(Math.max(0, t - prev));
    prev = t;
  }
  return gaps;
}

/**
 * The simple (non-phase-sliced) case: real per-move gaps when `moveTimestamps`
 * lines up one-for-one with `moves`, otherwise a level fallback cadence so a
 * stale or hand-edited reconstruction never paces playback against the wrong
 * moves. For a phase-sliced replay (see SolveReplay.tsx), slice the output of
 * `gapsFromTimestamps` yourself instead — this always covers the whole move list.
 */
export function computeReplayGaps(moves: readonly string[], moveTimestamps?: readonly number[]): { gaps: number[]; hasRealTiming: boolean } {
  if (moveTimestamps && moveTimestamps.length === moves.length) {
    return { gaps: gapsFromTimestamps(moveTimestamps), hasRealTiming: true };
  }
  return { gaps: moves.map(() => FALLBACK_GAP_MS), hasRealTiming: false };
}
