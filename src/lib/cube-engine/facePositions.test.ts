import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "./engine";
import { CORNER_FACELETS, EDGE_FACELETS, E_SLICE_EDGE_FACELETS, SOLVED_FACELET_STRING } from "./facePositions";

/**
 * These constants were derived empirically (apply a single move, diff
 * asString() against solved) rather than from documentation this vendored
 * cube.js fork doesn't ship — this test locks that derivation in.
 *
 * One wrinkle a naive version of this test walks straight into: turning a
 * face never disturbs *that same face's own* block when starting from
 * solved — the block is uniformly one color both before and after, so a
 * piece can genuinely move through it without the facelet *string* ever
 * showing a difference. So "is facelet X disturbed by turning face Y" is
 * only meaningful for Y other than whichever face X's block itself belongs
 * to — self-turns are skipped below, not asserted false.
 */

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;
type FaceLetter = (typeof FACE_ORDER)[number];

function ownFace(facelet: number): FaceLetter {
  return FACE_ORDER[Math.floor(facelet / 9)];
}

function disturbedIndices(move: string): Set<number> {
  const before = SOLVED_FACELET_STRING;
  const after = cubeFromAlg(move).asString();
  const out = new Set<number>();
  for (let i = 0; i < 54; i++) if (before[i] !== after[i]) out.add(i);
  return out;
}

const DISTURBED: Record<FaceLetter, Set<number>> = {
  U: disturbedIndices("U"),
  R: disturbedIndices("R"),
  F: disturbedIndices("F"),
  D: disturbedIndices("D"),
  L: disturbedIndices("L"),
  B: disturbedIndices("B"),
};

/** Every face this facelet's piece touches, `faces`, must disturb it — except the facelet's own face block, which self-masks (see file doc comment) — and every face it doesn't touch must not. */
function expectAdjacency(facelet: number, faces: FaceLetter[]) {
  const self = ownFace(facelet);
  for (const face of FACE_ORDER) {
    if (face === self) continue;
    expect(DISTURBED[face].has(facelet)).toBe(faces.includes(face));
  }
}

describe("facePositions", () => {
  it("solved cube reads as the reference string", () => {
    expect(cubeFromAlg("").asString()).toBe(SOLVED_FACELET_STRING);
  });

  describe("CORNER_FACELETS", () => {
    // CORNER.URF/UFL/ULB/UBR = 0/1/2/3.
    const CASES: [number, string, FaceLetter[]][] = [
      [0, "URF", ["U", "R", "F"]],
      [1, "UFL", ["U", "F", "L"]],
      [2, "ULB", ["U", "L", "B"]],
      [3, "UBR", ["U", "B", "R"]],
    ];
    it.each(CASES)("corner %i (%s)", (corner, _name, faces) => {
      for (const facelet of CORNER_FACELETS[corner]) expectAdjacency(facelet, faces);
    });
  });

  describe("EDGE_FACELETS (U layer)", () => {
    const CASES: [number, string, FaceLetter[]][] = [
      [0, "UR", ["U", "R"]],
      [1, "UF", ["U", "F"]],
      [2, "UL", ["U", "L"]],
      [3, "UB", ["U", "B"]],
    ];
    it.each(CASES)("edge %i (%s)", (edge, _name, faces) => {
      for (const facelet of EDGE_FACELETS[edge]) expectAdjacency(facelet, faces);
    });
  });

  describe("E_SLICE_EDGE_FACELETS (equator, no U/D sticker)", () => {
    const CASES: [number, string, FaceLetter[]][] = [
      [8, "FR", ["F", "R"]],
      [9, "FL", ["F", "L"]],
      [10, "BL", ["L", "B"]],
      [11, "BR", ["R", "B"]],
    ];
    it.each(CASES)("edge %i (%s)", (edge, _name, faces) => {
      for (const facelet of E_SLICE_EDGE_FACELETS[edge]) expectAdjacency(facelet, faces);
    });
  });
});
