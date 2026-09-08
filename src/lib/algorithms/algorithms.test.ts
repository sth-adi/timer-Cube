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

/**
 * A last-layer case is defined by a cube state, so two entries are the same
 * case whenever their states differ only by an AUF. Canonicalizing over those
 * rotations is what turns "these algorithms all work" into "these algorithms
 * cover every case exactly once" — the property a hand-written table can lose
 * silently, and did: an earlier version of this file listed 57 OLL entries
 * covering only 41 distinct cases.
 */
function rotateSlots(values: number[], n: number): number[] {
  const out = [...values];
  for (let k = 0; k < n; k++) out.unshift(out.pop()!);
  return out;
}

function ollClassKey(cube: InstanceType<typeof Cube>): string {
  const co = LL_CORNERS.map((s) => cube.co[s]);
  const eo = LL_EDGES.map((s) => cube.eo[s]);
  return [0, 1, 2, 3].map((n) => [...rotateSlots(co, n), ...rotateSlots(eo, n)].join(",")).sort()[0];
}

/** PLL is recognized modulo an AUF on both sides: one to line up, one to finish. */
function pllClassKey(cube: InstanceType<typeof Cube>): string {
  const cp = LL_CORNERS.map((s) => cube.cp[s]);
  const ep = LL_EDGES.map((s) => cube.ep[s]);
  const variants: string[] = [];
  for (let a = 0; a < 4; a++) {
    const relabel = rotateSlots([0, 1, 2, 3], a);
    for (let b = 0; b < 4; b++) {
      variants.push(
        rotateSlots(cp.map((v) => relabel[v]), b).join("") +
          "|" +
          rotateSlots(ep.map((v) => relabel[v]), b).join(""),
      );
    }
  }
  return variants.sort()[0];
}

function caseStateFor(alg: string): InstanceType<typeof Cube> {
  const cube = new Cube();
  cube.move(invertAlg(alg));
  return cube;
}

/** Every legal last-layer orientation: corner twists sum to 0 mod 3, flips are even. */
function everyOrientationClass(): Set<string> {
  const classes = new Set<string>();
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      for (let c = 0; c < 3; c++) {
        const d = (3 - ((a + b + c) % 3)) % 3;
        for (let p = 0; p < 2; p++) {
          for (let q = 0; q < 2; q++) {
            for (let r = 0; r < 2; r++) {
              const cube = new Cube();
              [a, b, c, d].forEach((v, i) => (cube.co[LL_CORNERS[i]] = v));
              [p, q, r, (p + q + r) % 2].forEach((v, i) => (cube.eo[LL_EDGES[i]] = v));
              classes.add(ollClassKey(cube));
            }
          }
        }
      }
    }
  }
  return classes;
}

function permutationsOf(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  const out: number[][] = [];
  items.forEach((item, i) => {
    for (const rest of permutationsOf(items.filter((_, j) => j !== i))) out.push([item, ...rest]);
  });
  return out;
}

/** Every legal last-layer permutation: corner and edge parity must agree. */
function everyPermutationClass(): Set<string> {
  const parity = (p: number[]) => {
    let swaps = 0;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) swaps++;
    return swaps % 2;
  };
  const classes = new Set<string>();
  const perms = permutationsOf([0, 1, 2, 3]);
  for (const cp of perms) {
    for (const ep of perms) {
      if (parity(cp) !== parity(ep)) continue;
      const cube = new Cube();
      cp.forEach((v, i) => (cube.cp[LL_CORNERS[i]] = v));
      ep.forEach((v, i) => (cube.ep[LL_EDGES[i]] = v));
      classes.add(pllClassKey(cube));
    }
  }
  return classes;
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

  it("covers all 21 permutation classes, one algorithm each", () => {
    const all = everyPermutationClass();
    const solvedKey = pllClassKey(new Cube());
    expect(all.size).toBe(22); // the 21 cases plus an already-permuted layer

    const covered = new Map<string, string[]>();
    for (const c of PLL_CASES) {
      const key = pllClassKey(caseStateFor(c.alg));
      covered.set(key, [...(covered.get(key) ?? []), c.name]);
    }

    const duplicates = [...covered].filter(([, names]) => names.length > 1);
    expect(duplicates, `cases sharing one permutation: ${JSON.stringify(duplicates)}`).toEqual([]);
    expect(covered.has(solvedKey), "an entry that permutes nothing").toBe(false);

    const missing = [...all].filter((k) => k !== solvedKey && !covered.has(k));
    expect(missing, `permutation classes with no algorithm: ${missing.join(", ")}`).toEqual([]);
  });
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

  it("covers all 57 orientation classes, one algorithm each", () => {
    const all = everyOrientationClass();
    const solvedKey = ollClassKey(new Cube());
    expect(all.size).toBe(58); // the 57 cases plus an already-oriented layer

    const covered = new Map<string, string[]>();
    for (const c of OLL_CASES) {
      const key = ollClassKey(caseStateFor(c.alg));
      covered.set(key, [...(covered.get(key) ?? []), c.name]);
    }

    const duplicates = [...covered].filter(([, names]) => names.length > 1);
    expect(duplicates, `cases sharing one orientation: ${JSON.stringify(duplicates)}`).toEqual([]);
    expect(covered.has(solvedKey), "an entry that orients nothing").toBe(false);

    const missing = [...all].filter((k) => k !== solvedKey && !covered.has(k));
    expect(missing, `orientation classes with no algorithm: ${missing.join(", ")}`).toEqual([]);
  });

  it("names every case uniquely", () => {
    expect(new Set(OLL_CASES.map((c) => c.name)).size).toBe(OLL_CASES.length);
  });
});
