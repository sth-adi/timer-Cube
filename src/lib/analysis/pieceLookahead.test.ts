import { describe, expect, it } from "vitest";
import { crossLookaheadFacelets, f2lLookaheadFacelets, f2lPairSlotFacelets } from "./pieceLookahead";
import { CORNER_FACELETS, EDGE_FACELETS, E_SLICE_EDGE_FACELETS } from "@/lib/cube-engine/facePositions";
import { CORNER, EDGE } from "@/lib/cube-engine/engine";

describe("crossLookaheadFacelets", () => {
  it("highlights every cross edge's facelets when the scramble is empty (already solved)", () => {
    const highlighted = crossLookaheadFacelets("");
    for (const e of [EDGE.UR, EDGE.UF, EDGE.UL, EDGE.UB]) {
      for (const f of EDGE_FACELETS[e]) expect(highlighted.has(f)).toBe(true);
    }
  });

  it("highlights only the cross edges a single R move leaves untouched (UF, UL, UB — not UR)", () => {
    const highlighted = crossLookaheadFacelets("R");
    for (const f of EDGE_FACELETS[EDGE.UF]) expect(highlighted.has(f)).toBe(true);
    for (const f of EDGE_FACELETS[EDGE.UL]) expect(highlighted.has(f)).toBe(true);
    for (const f of EDGE_FACELETS[EDGE.UB]) expect(highlighted.has(f)).toBe(true);
    for (const f of EDGE_FACELETS[EDGE.UR]) expect(highlighted.has(f)).toBe(false);
  });
});

describe("f2lLookaheadFacelets", () => {
  it("highlights every F2L piece's facelets when the scramble is empty (already solved)", () => {
    const highlighted = f2lLookaheadFacelets("");
    for (const group of [...Object.values(CORNER_FACELETS), ...Object.values(E_SLICE_EDGE_FACELETS)]) {
      for (const f of group) expect(highlighted.has(f)).toBe(true);
    }
  });

  it("highlights exactly the F2L pieces a single R move leaves untouched", () => {
    const highlighted = f2lLookaheadFacelets("R");
    // Untouched by a single R turn: UFL, ULB corners; FL, BL equator edges.
    for (const f of CORNER_FACELETS[CORNER.UFL]) expect(highlighted.has(f)).toBe(true);
    for (const f of CORNER_FACELETS[CORNER.ULB]) expect(highlighted.has(f)).toBe(true);
    for (const f of E_SLICE_EDGE_FACELETS[EDGE.FL]) expect(highlighted.has(f)).toBe(true);
    for (const f of E_SLICE_EDGE_FACELETS[EDGE.BL]) expect(highlighted.has(f)).toBe(true);
    // Disturbed by R: URF, UBR corners; FR, BR equator edges.
    for (const f of CORNER_FACELETS[CORNER.URF]) expect(highlighted.has(f)).toBe(false);
    for (const f of CORNER_FACELETS[CORNER.UBR]) expect(highlighted.has(f)).toBe(false);
    for (const f of E_SLICE_EDGE_FACELETS[EDGE.FR]) expect(highlighted.has(f)).toBe(false);
    for (const f of E_SLICE_EDGE_FACELETS[EDGE.BR]) expect(highlighted.has(f)).toBe(false);
  });
});

describe("f2lPairSlotFacelets", () => {
  it("returns exactly the 5 facelets (3 corner + 2 edge) of the right slot for every pair index, matching PostSolvePhaseRow.f2lPairIndex's URF/UFL/ULB/UBR order", () => {
    const expectedCorners = [CORNER.URF, CORNER.UFL, CORNER.ULB, CORNER.UBR];
    const expectedEdges = [EDGE.FR, EDGE.FL, EDGE.BL, EDGE.BR];
    for (const i of [0, 1, 2, 3] as const) {
      const facelets = f2lPairSlotFacelets(i);
      expect(facelets.length).toBe(5);
      const expected = [...CORNER_FACELETS[expectedCorners[i]], ...E_SLICE_EDGE_FACELETS[expectedEdges[i]]];
      expect(new Set(facelets)).toEqual(new Set(expected));
    }
  });

  it("returns disjoint facelet sets for every pair — no two slots share a sticker", () => {
    const all = [0, 1, 2, 3].flatMap((i) => f2lPairSlotFacelets(i as 0 | 1 | 2 | 3));
    expect(new Set(all).size).toBe(all.length);
  });
});
