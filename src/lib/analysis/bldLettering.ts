/**
 * A Speffz-style lettering scheme for blindfolded solving: every one of the
 * 24 corner stickers and 24 edge stickers gets its own letter A-X, so a
 * piece cycle can be read aloud/memorized as a sequence of letters instead
 * of "the yellow-red-blue corner." Face order U-L-F-R-B-D, starting at the
 * sticker closest to the top-left as seen looking directly at the face,
 * going clockwise — the same convention documented for the community
 * "Speffz" scheme. Buffer position (corners and edges both) is letter A.
 *
 * Piece/slot indices below match the engine's CORNER/EDGE ordering (see
 * cube-engine/engine.ts) exactly, so cp/co/ep/eo can be indexed directly.
 */

export const LETTERS = "abcdefghijklmnopqrstuvwx";

export function letterName(index: number): string {
  return LETTERS[index]?.toUpperCase() ?? "?";
}

/**
 * CORNER_LETTER[slot][n] = letter index (0-23) for the sticker on corner
 * slot `slot` that faces the n-th home direction of the piece solved there
 * (n matches the [U/D, second, third] face order used by the cube engine's
 * own cornerColor table — see vendor/cube.js). Slot order: URF UFL ULB UBR
 * DFR DLF DBL DRB.
 */
export const CORNER_LETTER: readonly (readonly number[])[] = [
  [2, 12, 9], // URF: U=c R=m F=j
  [3, 8, 5], // UFL: U=d F=i L=f
  [0, 4, 17], // ULB: U=a L=e B=r
  [1, 16, 13], // UBR: U=b B=q R=n
  [21, 10, 15], // DFR: D=v F=k R=p
  [20, 6, 11], // DLF: D=u L=g F=l
  [23, 18, 7], // DBL: D=x B=s L=h
  [22, 14, 19], // DRB: D=w R=o B=t
];

/**
 * EDGE_LETTER[slot][n] = letter index for the sticker on edge slot `slot`
 * facing the n-th home direction (matching the engine's edgeColor face
 * order). Slot order: UR UF UL UB DR DF DL DB FR FL BL BR.
 */
export const EDGE_LETTER: readonly (readonly number[])[] = [
  [1, 12], // UR: U=b R=m
  [2, 8], // UF: U=c F=i
  [3, 4], // UL: U=d L=e
  [0, 16], // UB: U=a B=q
  [21, 14], // DR: D=v R=o
  [20, 10], // DF: D=u F=k
  [23, 6], // DL: D=x L=g
  [22, 18], // DB: D=w B=s
  [9, 15], // FR: F=j R=p
  [11, 5], // FL: F=l L=f
  [17, 7], // BL: B=r L=h
  [19, 13], // BR: B=t R=n
];

/** Human-readable slot label, for the on-screen legend (e.g. "ULB", "UF"). */
export const CORNER_SLOT_LABELS = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
export const EDGE_SLOT_LABELS = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];
