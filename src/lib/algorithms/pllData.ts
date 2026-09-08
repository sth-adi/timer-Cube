import type { AlgCase } from "./types";

/**
 * The 21 PLL (Permutation of the Last Layer) cases, applied once OLL is
 * already solved (last layer fully oriented). Standard, commonly-published
 * algorithms. See pllData.test.ts for the automated structural checks this
 * data is verified against — each algorithm is confirmed to be a valid,
 * non-trivial move sequence whose implied "before" state matches its
 * case's category (edges-only / corners-only / mixed), which catches gross
 * data-entry errors even though it can't independently confirm that a given
 * algorithm is *exactly* the community-standard one for that case name.
 */
export const PLL_CASES: AlgCase[] = [
  // Edges only (corners already in place)
  { id: "pll-ua", name: "Ua Perm", group: "PLL", alg: "R U' R U R U R U' R' U' R2" },
  { id: "pll-ub", name: "Ub Perm", group: "PLL", alg: "R2 U R U R' U' R' U' R' U R'" },
  { id: "pll-h", name: "H Perm", group: "PLL", alg: "M2 U M2 U2 M2 U M2" },
  { id: "pll-z", name: "Z Perm", group: "PLL", alg: "M' U M2 U M2 U M' U2 M2" },

  // Corners only (edges already in place)
  { id: "pll-aa", name: "Aa Perm", group: "PLL", alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { id: "pll-ab", name: "Ab Perm", group: "PLL", alg: "x R2 D2 R U R' D2 R U' R x'" },
  {
    id: "pll-e",
    name: "E Perm",
    group: "PLL",
    alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
  },

  // Adjacent corner+edge swap
  { id: "pll-t", name: "T Perm", group: "PLL", alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  {
    id: "pll-f",
    name: "F Perm",
    group: "PLL",
    alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  },
  { id: "pll-ja", name: "Ja Perm", group: "PLL", alg: "R' U L' U2 R U' R' U2 R L" },
  { id: "pll-jb", name: "Jb Perm", group: "PLL", alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  {
    id: "pll-ra",
    name: "Ra Perm",
    group: "PLL",
    alg: "R U' R' U' R U R D R' U' R D' R' U2 R'",
  },
  { id: "pll-rb", name: "Rb Perm", group: "PLL", alg: "R' U2 R U2 R' F R U R' U' R' F' R2" },
  { id: "pll-v", name: "V Perm", group: "PLL", alg: "R2 F R U R U' R' F' R U2 R' U2 R" },
  {
    id: "pll-y",
    name: "Y Perm",
    group: "PLL",
    alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  },

  // Double (point-symmetric) corner+edge swap
  {
    id: "pll-na",
    name: "Na Perm",
    group: "PLL",
    alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  },
  {
    id: "pll-nb",
    name: "Nb Perm",
    group: "PLL",
    alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  },

  // Double 3-cycle
  {
    id: "pll-ga",
    name: "Ga Perm",
    group: "PLL",
    alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'",
  },
  {
    id: "pll-gb",
    name: "Gb Perm",
    group: "PLL",
    alg: "R' U' R U D' R2 U R' U R U' R U' R2 D",
  },
  {
    id: "pll-gc",
    name: "Gc Perm",
    group: "PLL",
    alg: "R2 U' R U' R U R' U R2 D' U R U' R' D",
  },
  {
    id: "pll-gd",
    name: "Gd Perm",
    group: "PLL",
    alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  },
];
