/**
 * Widths for a stack of placeholder bars: a fixed, uneven pattern, so a list of skeleton rows looks like text of
 * different lengths rather than a grid of identical blocks — and is the same on the server and the client (no
 * Math.random, which would also mismatch on hydration).
 */
const PATTERN = [0.62, 0.84, 0.5, 0.74, 0.92, 0.58, 0.7, 0.46] as const;

/** The width of bar `index` as a CSS percentage, between `min` and `max` percent (defaults 45 to 95). */
export function skeletonWidth(index: number, min = 45, max = 95): string {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = PATTERN[((Math.trunc(index) % PATTERN.length) + PATTERN.length) % PATTERN.length];
  return `${Math.round(lo + (hi - lo) * step)}%`;
}
