import { describe, expect, it } from "vitest";
import { buildArrows, buildOllDiagram, buildPllDiagram, MUTED_GRAY } from "./ollPllDiagram";
import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { CORNER_FACELETS, EDGE_FACELETS } from "@/lib/cube-engine/facePositions";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { OLL_CASES } from "@/lib/algorithms/ollData";

/** A real, valid last-layer-only PLL algorithm — arbitrary full-cube move sequences (like a raw "R2 U2 R2...") aren't guaranteed to keep permutation confined to the last layer the way an actual PLL alg is by construction. */
function pllSetup(name: string): string {
  const c = PLL_CASES.find((p) => p.name === name);
  if (!c) throw new Error(`test fixture: no PLL case named "${name}"`);
  return invertAlg(c.alg);
}

/** Same reasoning as pllSetup, for OLL — a real OLL alg only reorients last-layer pieces, keeping every one of them in its U-layer slot, which an arbitrary move sequence isn't guaranteed to do. */
function ollSetup(name: string): string {
  const c = OLL_CASES.find((o) => o.name === name);
  if (!c) throw new Error(`test fixture: no OLL case named "${name}"`);
  return invertAlg(c.alg);
}

describe("buildArrows (cycle decomposition)", () => {
  it("returns nothing for the identity permutation", () => {
    expect(buildArrows([0, 1, 2, 3], "corner")).toEqual([]);
  });

  it("collapses a pure swap into one double-headed arrow", () => {
    expect(buildArrows([1, 0, 2, 3], "corner")).toEqual([{ kind: "corner", from: 0, to: 1, doubleHeaded: true }]);
  });

  it("draws one single-headed arrow per step of a 3-cycle", () => {
    expect(buildArrows([1, 2, 0, 3], "edge")).toEqual([
      { kind: "edge", from: 0, to: 1, doubleHeaded: false },
      { kind: "edge", from: 1, to: 2, doubleHeaded: false },
      { kind: "edge", from: 2, to: 0, doubleHeaded: false },
    ]);
  });

  it("handles two independent swaps as two separate double-headed arrows", () => {
    expect(buildArrows([1, 0, 3, 2], "corner")).toEqual([
      { kind: "corner", from: 0, to: 1, doubleHeaded: true },
      { kind: "corner", from: 2, to: 3, doubleHeaded: true },
    ]);
  });

  it("draws all 4 steps for a full 4-cycle", () => {
    expect(buildArrows([1, 2, 3, 0], "corner")).toEqual([
      { kind: "corner", from: 0, to: 1, doubleHeaded: false },
      { kind: "corner", from: 1, to: 2, doubleHeaded: false },
      { kind: "corner", from: 2, to: 3, doubleHeaded: false },
      { kind: "corner", from: 3, to: 0, doubleHeaded: false },
    ]);
  });
});

describe("buildOllDiagram", () => {
  it("shows every U-layer piece in the target color when solved", () => {
    const d = buildOllDiagram("");
    for (const [uFacelet] of Object.values(CORNER_FACELETS)) expect(d.facelets[uFacelet]).toBe(FACELET_COLORS.D);
    for (const [uFacelet] of Object.values(EDGE_FACELETS)) expect(d.facelets[uFacelet]).toBe(FACELET_COLORS.D);
  });

  it("colors the U face's own center — no piece owns it, but it should never fall through to a placeholder", () => {
    expect(buildOllDiagram(ollSetup("Dot 1")).facelets[4]).toBe(FACELET_COLORS.D);
  });

  /**
   * Every piece has exactly one sticker that's "target colored" (the one
   * that started on U before scrambling) — an oriented piece still shows it
   * on the U-facelet, but an unoriented one shows it on a side facelet
   * instead, which is real recognition information a reference diagram must
   * draw, not noise to gray out. Checked against every real OLL case so the
   * co∈{0,1,2}→{uFacelet,side1,side2} and eo∈{0,1}→{uFacelet,side} mapping
   * (derived empirically, see buildOllDiagram's doc comment) holds
   * universally, not just for one fixture.
   */
  it.each(OLL_CASES.map((c) => c.name))("colors exactly one sticker per piece target-colored, matching co/eo, for %s", (name) => {
    const setupAlg = ollSetup(name);
    const cube = cubeFromAlg(setupAlg);
    const d = buildOllDiagram(setupAlg);
    for (const [cornerStr, [uFacelet, side1, side2]] of Object.entries(CORNER_FACELETS)) {
      const co = cube.co[Number(cornerStr)];
      expect(d.facelets[uFacelet]).toBe(co === 0 ? FACELET_COLORS.D : MUTED_GRAY);
      expect(d.facelets[side1]).toBe(co === 1 ? FACELET_COLORS.D : MUTED_GRAY);
      expect(d.facelets[side2]).toBe(co === 2 ? FACELET_COLORS.D : MUTED_GRAY);
    }
    for (const [edgeStr, [uFacelet, side]] of Object.entries(EDGE_FACELETS)) {
      const eo = cube.eo[Number(edgeStr)];
      expect(d.facelets[uFacelet]).toBe(eo === 0 ? FACELET_COLORS.D : MUTED_GRAY);
      expect(d.facelets[side]).toBe(eo === 0 ? MUTED_GRAY : FACELET_COLORS.D);
    }
  });

  it("never produces arrows — permutation is irrelevant to OLL", () => {
    expect(buildOllDiagram(ollSetup("Dot 1")).arrows).toEqual([]);
  });
});

describe("buildPllDiagram", () => {
  it("shows the target color on every U-layer position and no arrows when solved", () => {
    const d = buildPllDiagram("");
    for (const [uFacelet] of Object.values(CORNER_FACELETS)) expect(d.facelets[uFacelet]).toBe(FACELET_COLORS.D);
    for (const [uFacelet] of Object.values(EDGE_FACELETS)) expect(d.facelets[uFacelet]).toBe(FACELET_COLORS.D);
    expect(d.arrows).toEqual([]);
  });

  it("colors the U face's own center", () => {
    expect(buildPllDiagram(pllSetup("T Perm")).facelets[4]).toBe(FACELET_COLORS.D);
  });

  it("paints every side-strip sticker with the cube's own real color at that facelet", () => {
    const setupAlg = pllSetup("T Perm");
    const cube = cubeFromAlg(setupAlg);
    const raw = cube.asString();
    const d = buildPllDiagram(setupAlg);
    for (const [, side1, side2] of Object.values(CORNER_FACELETS)) {
      expect(d.facelets[side1]).toBe(FACELET_COLORS[raw[side1]]);
      expect(d.facelets[side2]).toBe(FACELET_COLORS[raw[side2]]);
    }
    for (const [, side] of Object.values(EDGE_FACELETS)) expect(d.facelets[side]).toBe(FACELET_COLORS[raw[side]]);
  });

  /** Every misplaced slot must be *covered* by some arrow — as a `from` always, and for a double-headed 2-cycle arrow also as its `to` (one arrow object stands for both directions there, by design — see buildArrows). */
  function coveredSlots(arrows: { from: number; to: number; doubleHeaded: boolean }[]): number[] {
    const out = new Set<number>();
    for (const a of arrows) {
      out.add(a.from);
      if (a.doubleHeaded) out.add(a.to);
    }
    return [...out].sort();
  }

  it.each(["T Perm", "Y Perm", "H Perm", "Ja Perm"])(
    "every arrow matches the cube's own cp/ep permutation for %s, covering every out-of-place piece",
    (name) => {
      const setupAlg = pllSetup(name);
      const cube = cubeFromAlg(setupAlg);
      const d = buildPllDiagram(setupAlg);

      const misplacedCorners = [0, 1, 2, 3].filter((i) => cube.cp[i] !== i).sort();
      expect(coveredSlots(d.arrows.filter((a) => a.kind === "corner"))).toEqual(misplacedCorners);
      for (const a of d.arrows.filter((x) => x.kind === "corner")) expect(cube.cp[a.from]).toBe(a.to);

      const misplacedEdges = [0, 1, 2, 3].filter((i) => cube.ep[i] !== i).sort();
      expect(coveredSlots(d.arrows.filter((a) => a.kind === "edge"))).toEqual(misplacedEdges);
      for (const a of d.arrows.filter((x) => x.kind === "edge")) expect(cube.ep[a.from]).toBe(a.to);
    },
  );
});
