import { slicePairLabel } from "./slicePair";

/**
 * The text shown while a turn is made (the floating label on the Gyro Twin). A middle-slice turn arrives
 * as two outer-face turns a moment apart, so when the new turn completes such a pair with the one before it
 * the label becomes the slice move ("M'") instead of "L" then "R'"; any other turn is just its own token.
 */
export function liveMoveLabel(previous: { token: string; atMs: number } | null, token: string, atMs: number): string {
  if (!previous) return token;
  return slicePairLabel(previous.token, previous.atMs, token, atMs) ?? token;
}
