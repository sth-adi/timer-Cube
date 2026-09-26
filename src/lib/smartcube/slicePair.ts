import { apply, FACE_NORMALS, faceForVector, type Mat3 } from "@/lib/gyro/orientation";

/**
 * A middle-slice turn (M, E, S — and their primes/doubles) has no wire
 * representation on any smart-cube protocol this app decodes: GAN, Giiker/
 * GoCube, QiYi and MoYu all report a move as one of the 6 outer faces
 * (U/R/F/D/L/B) plus a direction, nothing else — confirmed straight from
 * poliva/smartcube-web-bluetooth's own protocol decoders, which never emit
 * anything else. So a physical M/E/S turn always arrives as two ordinary
 * turns on the two faces either side of the slice — R with L for M, U
 * with D for E, F with B for S — landing together, since they travel in
 * the very same Bluetooth notification.
 *
 * Tracking them as two literal turns is exactly right: R and L (or U/D,
 * F/B) act on disjoint pieces, so they commute, and the pair reproduces a
 * real slice turn's cube state precisely (see this file's tests) — the
 * live cube, milestones and case recognition all already read correctly
 * through it. It's only the *written* reconstruction that reads oddly,
 * showing "R' L" where a cuber would write "M". This file merges that
 * shape for display, purely cosmetically: it never changes which tokens
 * get replayed anywhere else in the app (the engine's own M/E/S tokens
 * aren't plain slice turns — see the doc comment on PAIR_LABEL below — so
 * this merge is one-way, reconstruction text only, never fed back in).
 */

const OPPOSITE_FACE: Record<string, string> = { R: "L", L: "R", U: "D", D: "U", F: "B", B: "F" };

/**
 * How close two opposite-face turns need to land to be this shape rather
 * than two real, independent turns that just happen to be on opposite
 * faces. Deliberately far tighter than a double-turn's merge window
 * (doubleTurns.ts, 250ms) — two chunks from the very same Bluetooth
 * notification, which is what this is catching, land within single-digit
 * milliseconds of each other; a real solver's hands, even executing an
 * algorithm at full speed, don't manage two turns that close together. A
 * looser window would risk relabelling a genuinely fast R...L-shaped
 * algorithm sequence as a slice move it never was.
 */
export const SLICE_PAIR_WINDOW_MS = 40;

/**
 * The slice label a same-instant opposite-face pair reads as, keyed by the
 * two raw tokens concatenated (either order — R and L turns commute, so
 * both arrival orders are the same physical move). Pinned against the
 * cube engine in slicePair.test.ts: the engine's own bare "M"/"E"/"S"
 * tokens are *not* plain slice turns (they bundle in a whole-cube
 * reorientation too, a quirk of this vendor engine's own move table), so
 * these mappings were derived by checking full facelet equality against
 * `<engine's M> <some rotation>`, not assumed from notation alone.
 */
const PAIR_LABEL: Record<string, string> = {
  "RL'": "M",
  "L'R": "M",
  "LR'": "M'",
  "R'L": "M'",
  "R2L2": "M2",
  "L2R2": "M2",
  "UD'": "E",
  "D'U": "E",
  "DU'": "E'",
  "U'D": "E'",
  "U2D2": "E2",
  "D2U2": "E2",
  "FB'": "S'",
  "B'F": "S'",
  "BF'": "S",
  "F'B": "S",
  "F2B2": "S2",
  "B2F2": "S2",
};

/** The slice-move label a same-instant opposite-face pair reads as, or null if this isn't that shape. */
export function slicePairLabel(aToken: string, aMs: number, bToken: string, bMs: number): string | null {
  if (OPPOSITE_FACE[aToken[0]] !== bToken[0]) return null;
  if (Math.abs(bMs - aMs) > SLICE_PAIR_WINDOW_MS) return null;
  return PAIR_LABEL[aToken + bToken] ?? null;
}

export interface SliceMergeable {
  token: string;
  timeStampMs: number;
}

/**
 * The physical face whose own direction convention each slice follows
 * (WCA notation: M follows L, E follows D, S follows F) — the reference
 * `sliceViewerMove` relabels the same way `viewerMove` relabels an outer
 * face turn, since a slice's whole identity (which axis, which sense) is
 * defined entirely in terms of that one face.
 */
const SLICE_FOLLOWS: Record<string, string> = { M: "L", E: "D", S: "F" };

/** Reverse of SLICE_FOLLOWS, plus the opposite face on each axis, which flips the slice's sense (M follows L, so wherever L's normal maps to *R* instead, the same physical turn reads as M', not M). */
const FACE_TO_SLICE: Record<string, { base: string; flip: boolean }> = {
  L: { base: "M", flip: false },
  R: { base: "M", flip: true },
  D: { base: "E", flip: false },
  U: { base: "E", flip: true },
  F: { base: "S", flip: false },
  B: { base: "S", flip: true },
};

/**
 * Re-expresses a physical slice turn in the viewer's own frame — the
 * slice-move counterpart to gyro/orientation.ts's viewerMove, which only
 * understands the 6 outer faces. Needed because a slice isn't tied to
 * *looking at* a face the way U/R/F/etc. are (viewerMove's own
 * relabel-by-position trick doesn't reach it) — it's tied to a face's
 * *direction convention*, so this relabels by tracking where that
 * reference face's normal ends up, the same as viewerMove does, and reads
 * the resulting slice + sense off FACE_TO_SLICE. Passes anything else
 * (outer faces, rotations, wide moves) through unchanged.
 */
export function sliceViewerMove(physicalToken: string, orientation: Mat3): string {
  const base = physicalToken[0];
  const ref = SLICE_FOLLOWS[base];
  if (!ref) return physicalToken;
  const mapped = FACE_TO_SLICE[faceForVector(apply(orientation, FACE_NORMALS[ref]))];
  const suffix = physicalToken.slice(1);
  const flipped = suffix === "2" ? "2" : mapped.flip ? (suffix === "'" ? "" : "'") : suffix;
  return mapped.base + flipped;
}

/**
 * Rewrites every same-instant opposite-face pair in `moves` into the
 * single slice-move token it reads as — for a written reconstruction or
 * any other readable move list. Never used for anything the engine or
 * case recognition reads: see this file's own doc comment for why.
 */
export function mergeSlicePairs<T extends SliceMergeable>(moves: readonly T[]): SliceMergeable[] {
  const out: SliceMergeable[] = [];
  for (let i = 0; i < moves.length; i++) {
    const next = moves[i + 1];
    const label = next ? slicePairLabel(moves[i].token, moves[i].timeStampMs, next.token, next.timeStampMs) : null;
    if (label) {
      out.push({ token: label, timeStampMs: next.timeStampMs });
      i++; // consumed both
    } else {
      out.push({ token: moves[i].token, timeStampMs: moves[i].timeStampMs });
    }
  }
  return out;
}
