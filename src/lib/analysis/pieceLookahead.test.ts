import { describe, expect, it } from "vitest";
import { crossLookaheadFacelets, f2lLookaheadFacelets } from "./pieceLookahead";
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
