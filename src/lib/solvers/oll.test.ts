import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { f2lPairSolved } from "./oll";

describe("f2lPairSolved", () => {
  it("reports all 4 pairs solved on a solved cube", () => {
    const cube = cubeFromAlg("");
    for (const i of [0, 1, 2, 3] as const) expect(f2lPairSolved(cube, i)).toBe(true);
  });

  it("reports the disturbed pairs unsolved and the untouched pairs still solved after a single R turn", () => {
    // R disturbs the URF/UBR corners (pair 0 and pair 3) and the FR/BR
    // E-slice edges (also pair 0 and pair 3) — UFL/FL (pair 1) and ULB/BL
    // (pair 2) never touch the R face at all, so they stay solved.
    const cube = cubeFromAlg("R");
    expect(f2lPairSolved(cube, 0)).toBe(false);
    expect(f2lPairSolved(cube, 3)).toBe(false);
    expect(f2lPairSolved(cube, 1)).toBe(true);
    expect(f2lPairSolved(cube, 2)).toBe(true);
  });

  it("requires both the corner AND its paired edge in place — a solved corner with a misplaced edge doesn't count", () => {
    // F2 U' D' L' F' R returns URF (pair 0's corner) to its home slot,
    // oriented, while leaving FR (pair 0's edge) permuted elsewhere —
    // confirms the AND, not just the corner half of the check.
    const cube = cubeFromAlg("F2 U' D' L' F' R");
    expect(cube.cp[0]).toBe(0);
    expect(cube.co[0]).toBe(0);
    expect(cube.ep[8]).not.toBe(8);
    expect(f2lPairSolved(cube, 0)).toBe(false);
  });

  it("agrees with a direct cp/co/ep/eo check on every pair, for a real scramble", () => {
    const cube = cubeFromAlg("R U2 R' F' U F R U' R' F R F'");
    for (const i of [0, 1, 2, 3] as const) {
      const corner = i;
      const edge = 8 + i;
      const expected = cube.cp[corner] === corner && cube.co[corner] === 0 && cube.ep[edge] === edge && cube.eo[edge] === 0;
      expect(f2lPairSolved(cube, i)).toBe(expected);
    }
  });
});
