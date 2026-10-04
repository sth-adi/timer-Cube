import { slicePairLabel } from "@/lib/smartcube/slicePair";

/**
 * The move text under a replay. The 3D player is always fed the raw tokens
 * (the cube reports a slice turn as two outer-face turns, and the engine
 * replays those exactly); what's *read* goes through the same slice-pair
 * merge as the recap's written reconstruction (see mergeSlicePairs), so one
 * solve reads "M" in both places instead of "R' L" in one of them.
 */

export interface DisplayMove {
  /** What is shown: a raw token, or the slice move a same-instant pair of them merged into. */
  token: string;
  /** The raw moves (indices into the player's alg) this one covers. */
  first: number;
  last: number;
}

/**
 * The display tokens for `tokens`, each remembering which raw moves it covers.
 * A merge needs to know two turns landed together, so without per-move
 * `timestamps` (one-for-one with `tokens`) nothing merges. Applies the exact
 * rule of mergeSlicePairs — both go through slicePairLabel.
 */
export function displayMoves(tokens: readonly string[], timestamps?: readonly number[]): DisplayMove[] {
  const timed = !!timestamps && timestamps.length === tokens.length;
  const out: DisplayMove[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const label = timed && i + 1 < tokens.length ? slicePairLabel(tokens[i], timestamps[i], tokens[i + 1], timestamps[i + 1]) : null;
    if (label) {
      out.push({ token: label, first: i, last: i + 1 });
      i++;
    } else {
      out.push({ token: tokens[i], first: i, last: i });
    }
  }
  return out;
}

/**
 * The display token that holds raw move `rawIndex`, or -1 (before the first
 * move). A merged pair is lit as one: while either of its two turns is the
 * current one.
 */
export function displayIndexForMove(display: readonly DisplayMove[], rawIndex: number): number {
  if (rawIndex < 0) return -1;
  const at = display.findIndex((d) => rawIndex >= d.first && rawIndex <= d.last);
  return at;
}
