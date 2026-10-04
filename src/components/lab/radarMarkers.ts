/** Furthest right (in % of the track) a marker may start, so its minimum width still fits. */
const MAX_LEFT_PCT = 98;
/** Narrowest a marker is drawn (in % of the track), so an instant mistake is still something to tap. */
const MIN_WIDTH_PCT = 2;

/**
 * Where a mistake sits on the Mistake Radar's timeline, in percent of the
 * track: it starts where it happened and is as wide as it cost, but is never
 * drawn past either end — a late mistake (or one that cost more than was left
 * of the solve) is cut short instead of poking out of the track.
 */
export function markerSpan(atMs: number, costMs: number, totalMs: number): { left: number; width: number } {
  const total = Math.max(1, totalMs);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  const left = clamp((atMs / total) * 100, 0, MAX_LEFT_PCT);
  const width = clamp((costMs / total) * 100, MIN_WIDTH_PCT, 100 - left);
  return { left, width };
}
