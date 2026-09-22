/**
 * How close together two same-face, same-direction quarter turns have to
 * land to count as one physical double turn rather than two independent
 * ones. Generous next to a real double-flip (well under 150ms even for a
 * slow turner) but nowhere near a genuine recognition pause (300ms+ at an
 * absolute minimum).
 */
export const DOUBLE_TURN_MERGE_WINDOW_MS = 250;

/**
 * Whether a freshly-arrived quarter turn should merge into the previous
 * move as a double turn (U2, D2, …) rather than being recorded as its own
 * separate move.
 *
 * Several smart-cube protocols' firmware only ever reports individual 90°
 * clicks — a quick double-flip shows up as two separate same-face events
 * with nothing in either one saying they were a single deliberate 180°
 * turn. Two consecutive quarter turns on the same face in the *same*
 * direction, thrown fast enough to be one continuous motion, are
 * notationally (and physically) identical to a single X2 move — no
 * reconstruction tool distinguishes "R R" from "R2" — so those merge.
 *
 * The time gate matters: without it, a "R" that ends one phase and an
 * unrelated "R" that happens to start the next algorithm — with a real
 * recognition pause in between — would wrongly collapse into one
 * instantaneous "R2", corrupting both the reconstruction and any
 * recognition-vs-execution timing derived from it.
 *
 * Two consecutive turns in *opposite* directions cancel out instead (a
 * regrip or correction, not a double turn) and are always left alone
 * rather than guessed at, gap or no gap — that's a different, more
 * ambiguous situation this deliberately doesn't try to interpret.
 */
export function mergesIntoDoubleTurn(
  lastToken: string | undefined,
  lastTimestampMs: number | undefined,
  rawToken: string,
  timestampMs: number,
): boolean {
  if (lastToken === undefined || lastTimestampMs === undefined) return false;
  if (lastToken !== rawToken || rawToken.includes("2")) return false;
  return timestampMs - lastTimestampMs <= DOUBLE_TURN_MERGE_WINDOW_MS;
}
