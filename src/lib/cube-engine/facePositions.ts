import { CORNER, EDGE } from "./engine";

/**
 * Global facelet-string indices (0-53, blocks U9 R9 F9 D9 L9 B9, each block
 * read row-major as `Cube.asString()` lays it out) for the pieces that live
 * in the U layer, plus the four E-slice (equator) edges — every piece an
 * OLL/PLL case diagram or a cross/F2L look-ahead icon needs to draw.
 *
 * Derived empirically (not from documentation, which this vendored cube.js
 * fork doesn't ship): applying a single U/R/F/D/L/B move to a solved cube
 * and diffing `asString()` reveals exactly which facelet index moves with
 * which named piece. See this file's test for the verification — every
 * entry here is checked against a solved cube (self-consistency: each
 * group's facelets all read as their own face letter) and against a couple
 * of known single-move results.
 *
 * Deliberately doesn't cover the D-layer (LAST_LAYER_CORNERS/EDGES) — no
 * current feature needs it, and guessing that mapping without the same
 * empirical check would just be introducing an unverified risk for no use.
 */

/** [U-face sticker, side-face sticker 1, side-face sticker 2] for each U-layer corner. */
export const CORNER_FACELETS: Record<number, readonly [number, number, number]> = {
  [CORNER.URF]: [8, 9, 20],
  [CORNER.UFL]: [6, 18, 38],
  [CORNER.ULB]: [0, 36, 47],
  [CORNER.UBR]: [2, 45, 11],
};

/** [U-face sticker, side-face sticker] for each U-layer edge. */
export const EDGE_FACELETS: Record<number, readonly [number, number]> = {
  [EDGE.UR]: [5, 10],
  [EDGE.UF]: [7, 19],
  [EDGE.UL]: [3, 37],
  [EDGE.UB]: [1, 46],
};

/** [side-face sticker, side-face sticker] for each E-slice (equator) edge — no U or D sticker, since these pieces touch neither. */
export const E_SLICE_EDGE_FACELETS: Record<number, readonly [number, number]> = {
  [EDGE.FR]: [23, 12],
  [EDGE.FL]: [21, 41],
  [EDGE.BL]: [39, 50],
  [EDGE.BR]: [14, 48],
};

export const SOLVED_FACELET_STRING = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
