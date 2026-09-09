/**
 * How fast each side of a dual replay should visually turn, relative to the
 * other — not an attempt at matching wall-clock duration exactly (cubing.js
 * doesn't expose an absolute "seconds per move" contract to hit precisely),
 * but a faithful *relative* comparison: whoever actually turned more moves
 * per second gets the visually faster cube, centered so the pair together
 * plays at a normal, watchable speed rather than drifting arbitrarily fast
 * or slow as solves get longer or shorter.
 */

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

export interface TempoPair {
  a: number;
  b: number;
}

function movesPerSecond(moveCount: number, timeMs: number): number | null {
  if (moveCount <= 0 || timeMs <= 0) return null;
  return moveCount / (timeMs / 1000);
}

export function relativeTempoScales(moveCountA: number, timeMsA: number, moveCountB: number, timeMsB: number): TempoPair {
  const tpsA = movesPerSecond(moveCountA, timeMsA);
  const tpsB = movesPerSecond(moveCountB, timeMsB);
  if (tpsA === null || tpsB === null) return { a: 1, b: 1 };

  const avg = (tpsA + tpsB) / 2;
  if (avg <= 0) return { a: 1, b: 1 };

  const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
  return { a: clamp(tpsA / avg), b: clamp(tpsB / avg) };
}
