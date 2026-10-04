/**
 * When a correction from the cube's own state report is what finishes a solve,
 * the turn that actually solved it was lost over Bluetooth, so the last
 * recorded turn is the one *before* it and the solve really ended about one
 * turn later. This guesses that moment from how fast the solver had been
 * turning — the median of the last few gaps, kept within a sane range — and
 * never later than the report that revealed it. It's an estimate: the solve
 * is flagged corrected (smartCubeStore's correctedDuringSolve) either way.
 */

/** How many of the latest turn gaps the median reads. */
const RECENT_GAPS = 8;
/** Bounds on the guess: a run of double-turn bursts shouldn't make it 0, a long stall shouldn't make it seconds. */
const MIN_TURN_GAP_MS = 80;
const MAX_TURN_GAP_MS = 600;
/** With fewer than two turns to go on. */
const DEFAULT_TURN_GAP_MS = 250;

export function typicalTurnGapMs(times: readonly number[]): number {
  const gaps: number[] = [];
  for (let i = Math.max(1, times.length - RECENT_GAPS); i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return DEFAULT_TURN_GAP_MS;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.min(MAX_TURN_GAP_MS, Math.max(MIN_TURN_GAP_MS, median));
}

/** The estimated time of a turn lost after the last of `times`, given when the report that revealed it arrived. */
export function lostTurnTimeMs(times: readonly number[], reportAtMs: number): number {
  if (times.length === 0) return reportAtMs;
  const last = times[times.length - 1];
  return Math.round(Math.max(last, Math.min(reportAtMs, last + typicalTurnGapMs(times))));
}
