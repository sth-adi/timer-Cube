/**
 * Where the first quarter of a double turn (U2 made as two quarter turns) fell.
 *
 * The smart-cube store merges two same-face, same-direction quarter turns that arrive within 250ms into one
 * move "U2" stamped with the second quarter's time. A solve saved with `moveHalfTimestamps` also knows when the
 * first quarter was made; every other solve (older ones, cloud and shared copies, imports without it) does not,
 * so the first quarter's time is estimated from the gap before the move.
 */

/** A plausible time between the two quarters of a double turn. */
export const DOUBLE_GAP_MS = 90;
/** The quarters are never closer than this, so each still gets a visible turn. */
export const MIN_DOUBLE_GAP_MS = 30;
/** Nor further apart than this share of the time since the previous move (a double thrown right after another move is quick). */
export const MAX_DOUBLE_GAP_FRAC = 0.45;

const FACE_DOUBLE = /^[URFDLB]2$/;

/** True for U2 D2 R2 L2 F2 B2: the only tokens that can be two quarter turns of one face. */
export function isFaceDouble(token: string): boolean {
  return FACE_DOUBLE.test(token);
}

/**
 * For each move, when its first quarter turn was made (same clock as `timestamps`), or null when the move is not
 * a face double (M2, rotations, quarter turns, or a double with no room for two turns before its stamp).
 * `halves` is the recorded first-quarter time per move (null/undefined where none was recorded); a recorded time
 * is used when it falls between the previous move and this one, anything else is estimated as the move's time
 * minus a plausible in-double gap.
 */
export function splitDoubles(tokens: readonly string[], timestamps: readonly number[], halves?: readonly (number | null | undefined)[] | null): (number | null)[] {
  return tokens.map((token, i) => {
    if (!isFaceDouble(token)) return null;
    const t2 = timestamps[i];
    if (typeof t2 !== "number" || !Number.isFinite(t2)) return null;
    const prev = i > 0 ? (timestamps[i - 1] ?? 0) : 0;
    const recorded = halves?.[i];
    if (typeof recorded === "number" && Number.isFinite(recorded) && recorded > prev && recorded < t2) return recorded;
    const gap = t2 - prev;
    const between = Math.max(MIN_DOUBLE_GAP_MS, Math.min(DOUBLE_GAP_MS, gap * MAX_DOUBLE_GAP_FRAC));
    const t1 = t2 - between;
    return t1 > prev ? t1 : null;
  });
}

/** Gaps (ms since the previous move, the first from 0) back to absolute times. */
export function gapsToTimes(gapsMs: readonly number[]): number[] {
  let t = 0;
  return gapsMs.map((g) => (t += Math.max(0, g)));
}
