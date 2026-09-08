import { describe, expect, it, beforeAll } from "vitest";
import { Cube } from "../cube-engine/engine";
import { PLL_CASES } from "./pllData";
import { OLL_CASES } from "./ollData";
import { invertAlg } from "./algUtils";
import type { AlgCase } from "./types";

// The Algorithm Library uses the traditional convention (last layer on U,
// first two layers on D) that every published OLL/PLL reference assumes —
// independent of the main solver's flipped (cross-on-U) convention used
// elsewhere in this app. See algUtils.ts / ollData.ts for why.
const LL_CORNERS = [0, 1, 2, 3];
const LL_EDGES = [0, 1, 2, 3];
const F2L_CORNERS = [4, 5, 6, 7];
const F2L_EDGES = [4, 5, 6, 7];
const E_SLICE_EDGES = [8, 9, 10, 11];

function firstTwoLayersSolved(cube: InstanceType<typeof Cube>): boolean {
  for (const s of F2L_CORNERS) if (cube.cp[s] !== s || cube.co[s] !== 0) return false;
  for (const s of F2L_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  for (const s of E_SLICE_EDGES) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  return true;
}

function lastLayerOriented(cube: InstanceType<typeof Cube>): boolean {
  for (const s of LL_CORNERS) if (cube.co[s] !== 0) return false;
  for (const s of LL_EDGES) if (cube.eo[s] !== 0) return false;
  return true;
}

function checkCaseIntegrity(c: AlgCase) {
  const setup = invertAlg(c.alg);

  // The alg must parse, and be a real (non-trivial) sequence: setting up
  // the case must actually leave the cube unsolved.
  const cube = new Cube();
  expect(() => cube.move(setup)).not.toThrow();
  expect(cube.isSolved()).toBe(false);

  // It must be a genuine *last-layer-only* case: first two layers already
  // solved before the algorithm is even applied.
  expect(firstTwoLayersSolved(cube)).toBe(true);

  if (c.group === "PLL") {
    // PLL assumes OLL is already done: last layer must be oriented (not
    // necessarily permuted) even before the algorithm runs.
    expect(lastLayerOriented(cube)).toBe(true);
  }

  // Applying the algorithm must solve it back — always true by
  // construction (setup = invert(alg)) but exercised here as a sanity
  // check on the pairing.
  cube.move(c.alg);
  expect(cube.isSolved()).toBe(true);

  if (c.group === "OLL") {
    // Re-derive the case and check the algorithm orients the last layer
    // (permutation may remain scrambled — OLL doesn't fix that).
    const c2 = new Cube();
    c2.move(setup);
    c2.move(c.alg);
    expect(firstTwoLayersSolved(c2)).toBe(true);
    expect(lastLayerOriented(c2)).toBe(true);
  }
}

describe("PLL_CASES", () => {
  beforeAll(() => {
    Cube.initSolver();
  });

  it("has exactly the 21 standard cases, each with a unique id", () => {
    expect(PLL_CASES).toHaveLength(21);
    expect(new Set(PLL_CASES.map((c) => c.id)).size).toBe(21);
  });

  it.each(PLL_CASES.map((c) => [c.name, c] as const))(
    "%s is a valid, non-trivial last-layer-permutation-only algorithm",
    (_name, c) => {
      checkCaseIntegrity(c);
    },
  );
});

describe("OLL_CASES", () => {
  beforeAll(() => {
    Cube.initSolver();
  });

  it("has exactly the 57 standard cases, each with a unique id", () => {
    expect(OLL_CASES).toHaveLength(57);
    expect(new Set(OLL_CASES.map((c) => c.id)).size).toBe(57);
  });

  it.each(OLL_CASES.map((c) => [c.name, c] as const))(
    "%s is a valid, non-trivial last-layer-orientation algorithm",
    (_name, c) => {
      checkCaseIntegrity(c);
    },
  );
});
