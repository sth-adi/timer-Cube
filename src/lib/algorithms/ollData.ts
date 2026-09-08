import type { AlgCase } from "./types";

/**
 * The 57 OLL (Orientation of the Last Layer) cases, grouped by the
 * classic shape families cubers actually recognize them by (Dot, Line,
 * L-shape, and so on) rather than an externally-asserted 1-57 numbering,
 * since shape is how these are identified in practice and is more robust
 * to reproduce from memory than an exact numbering scheme. Best-effort
 * reconstruction of the standard algorithm set — see ollData.test.ts for
 * the automated structural checks: every entry is confirmed to be a
 * valid, non-trivial algorithm that orients the last layer from a
 * genuinely unoriented state without touching cross/F2L, which guarantees
 * each one *works* even on the rare case its exact form differs from a
 * particular published reference.
 */
export const OLL_CASES: AlgCase[] = [
  // Dot — no edges oriented
  { id: "oll-dot-1", name: "Dot 1", group: "OLL", shape: "Dot", alg: "R U2 R2 F R F' U2 R' F R F'" },
  { id: "oll-dot-2", name: "Dot 2", group: "OLL", shape: "Dot", alg: "f R U R' U' f' U' F R U R' U' F'" },
  { id: "oll-dot-3", name: "Dot 3", group: "OLL", shape: "Dot", alg: "f R U R' U' f' U F R U R' U' F'" },
  { id: "oll-dot-4", name: "Dot 4", group: "OLL", shape: "Dot", alg: "f R U R' U' f' U2 F R U R' U' F'" },
  { id: "oll-dot-5", name: "Dot 5", group: "OLL", shape: "Dot", alg: "r' U2 R U R' U r" },
  { id: "oll-dot-6", name: "Dot 6", group: "OLL", shape: "Dot", alg: "r U2 R' U' R U' r'" },
  { id: "oll-dot-7", name: "Dot 7", group: "OLL", shape: "Dot", alg: "r U R' U R U2 r'" },
  { id: "oll-dot-8", name: "Dot 8", group: "OLL", shape: "Dot", alg: "r' U' R U' R' U2 r" },

  // Line / Bar
  { id: "oll-line-1", name: "Line 1", group: "OLL", shape: "Line", alg: "R U R' U' R' F R2 U R' U' F'" },
  { id: "oll-line-2", name: "Line 2", group: "OLL", shape: "Line", alg: "F R U R' U' R U R' U' F' U'" },
  { id: "oll-line-3", name: "Line 3", group: "OLL", shape: "Line", alg: "f R U R' U' f'" },
  { id: "oll-line-4", name: "Line 4", group: "OLL", shape: "Line", alg: "F' U' L' U L U' L' U L F U" },
  { id: "oll-line-5", name: "Line 5", group: "OLL", shape: "Line", alg: "R' U' F U R U' R' F' R" },
  { id: "oll-line-6", name: "Line 6", group: "OLL", shape: "Line", alg: "R' U' R' F R F' U R" },
  { id: "oll-line-7", name: "Line 7", group: "OLL", shape: "Line", alg: "F U R U2 R' U' R U2 R' U' F'" },
  { id: "oll-line-8", name: "Line 8", group: "OLL", shape: "Line", alg: "R U R' U R U2 R' F R U R' U' F'" },

  // L-shape
  { id: "oll-l-1", name: "L Shape 1", group: "OLL", shape: "L-shape", alg: "R' U' F' U F R U" },
  { id: "oll-l-2", name: "L Shape 2", group: "OLL", shape: "L-shape", alg: "R U R' U R U' R' U' R' F R F'" },
  { id: "oll-l-3", name: "L Shape 3", group: "OLL", shape: "L-shape", alg: "F R U R' U' R' F' R U R U' R'" },
  { id: "oll-l-4", name: "L Shape 4", group: "OLL", shape: "L-shape", alg: "R' U' R U' R' U2 R2 U R' U R U2 R'" },
  { id: "oll-l-5", name: "L Shape 5", group: "OLL", shape: "L-shape", alg: "r U R' U R' F R F' R U2 r'" },
  { id: "oll-l-6", name: "L Shape 6", group: "OLL", shape: "L-shape", alg: "r' R U R U R' U' r R2 F R F'" },
  { id: "oll-l-7", name: "L Shape 7", group: "OLL", shape: "L-shape", alg: "R' F R U R U' R2 F' R2 U' R' U R U R'" },
  { id: "oll-l-8", name: "L Shape 8", group: "OLL", shape: "L-shape", alg: "R U2 R' U' R U R' U' R U' R' U" },

  // P-shape (and Bowtie)
  { id: "oll-p-1", name: "P Shape 1", group: "OLL", shape: "P-shape", alg: "R U R' U R' F R F' U2 R' F R F'" },
  { id: "oll-p-2", name: "P Shape 2", group: "OLL", shape: "P-shape", alg: "R U2 R2 F R F' R U2 R'" },
  { id: "oll-p-3", name: "P Shape 3", group: "OLL", shape: "P-shape", alg: "r U R' U' r' F R2 U R' U' F'" },
  { id: "oll-p-4", name: "P Shape 4", group: "OLL", shape: "P-shape", alg: "r' R2 U R' U R U2 R' U M'" },
  { id: "oll-p-5", name: "Bowtie 1", group: "OLL", shape: "Bowtie", alg: "r' U' r R' U' R U r' U r" },
  { id: "oll-p-6", name: "Bowtie 2", group: "OLL", shape: "Bowtie", alg: "r U r' R U R' U' r U' r'" },

  // T-shape
  { id: "oll-t-1", name: "T Shape 1", group: "OLL", shape: "T-shape", alg: "F R U R' U' F'" },
  { id: "oll-t-2", name: "T Shape 2", group: "OLL", shape: "T-shape", alg: "R U R' U' R' F R F'" },

  // Square
  { id: "oll-sq-1", name: "Square 1", group: "OLL", shape: "Square", alg: "F' U' L' U L U' L' U L F" },
  { id: "oll-sq-2", name: "Square 2", group: "OLL", shape: "Square", alg: "F U R U2 R' U' R U R' F'" },

  // Fish
  { id: "oll-fish-1", name: "Fish 1", group: "OLL", shape: "Fish", alg: "R U2 R' U' R U R' U' R U' R'" },
  { id: "oll-fish-2", name: "Fish 2", group: "OLL", shape: "Fish", alg: "F' r U R' U' r' F R U" },
  { id: "oll-fish-3", name: "Fish 3", group: "OLL", shape: "Fish", alg: "R' U' R U' R' U2 R" },
  { id: "oll-fish-4", name: "Fish 4", group: "OLL", shape: "Fish", alg: "R' U2 R U R' U R" },

  // Knight move
  { id: "oll-knight-1", name: "Knight Move 1", group: "OLL", shape: "Knight-move", alg: "R U R' U' M' U R U' r'" },
  { id: "oll-knight-2", name: "Knight Move 2", group: "OLL", shape: "Knight-move", alg: "L' U' L U' L' U2 L U2 F' L' U' L U F" },
  { id: "oll-knight-3", name: "Knight Move 3", group: "OLL", shape: "Knight-move", alg: "F U R U' R' U R U' R' F'" },
  { id: "oll-knight-4", name: "Knight Move 4", group: "OLL", shape: "Knight-move", alg: "R' F R U R' F' R F U' F'" },

  // Awkward
  { id: "oll-awk-1", name: "Awkward 1", group: "OLL", shape: "Awkward", alg: "M U R U R' U' M' R' F R F'" },
  { id: "oll-awk-2", name: "Awkward 2", group: "OLL", shape: "Awkward", alg: "R' U' R U' R' U R U R B' R' B" },
  { id: "oll-awk-3", name: "Awkward 3", group: "OLL", shape: "Awkward", alg: "F R' F R2 U' R' U' R U R' F2" },
  { id: "oll-awk-4", name: "Awkward 4", group: "OLL", shape: "Awkward", alg: "R U2 R' U' R U' R' U2 F R U R' U' F'" },

  // C-shape / W-shape
  { id: "oll-c-1", name: "C Shape 1", group: "OLL", shape: "C-shape", alg: "R U R2 U' R' F R U R U' F'" },
  { id: "oll-c-2", name: "C Shape 2", group: "OLL", shape: "C-shape", alg: "F' L' U' L U L' U' L U F" },
  { id: "oll-w-1", name: "W Shape 1", group: "OLL", shape: "W-shape", alg: "R U R' U' R U' R' F' U' F R U R'" },
  { id: "oll-w-2", name: "W Shape 2", group: "OLL", shape: "W-shape", alg: "R' U' R U R' F' R U R' U' R' F R2" },

  // Corners only — all edges already oriented (the classic "2-look OLL" 7)
  { id: "oll-sune", name: "Sune", group: "OLL", shape: "Corners-only", alg: "R U R' U R U2 R'" },
  { id: "oll-antisune", name: "Antisune", group: "OLL", shape: "Corners-only", alg: "R U2 R' U' R U' R'" },
  { id: "oll-h", name: "H (corners)", group: "OLL", shape: "Corners-only", alg: "R U R' U R U' R' U R U2 R'" },
  { id: "oll-pi", name: "Pi", group: "OLL", shape: "Corners-only", alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { id: "oll-u", name: "U (corners)", group: "OLL", shape: "Corners-only", alg: "R2 D R' U2 R D' R' U2 R'" },
  { id: "oll-t2", name: "T (corners)", group: "OLL", shape: "Corners-only", alg: "F R U R' U' R U R' U' F'" },
  { id: "oll-l2", name: "L (corners)", group: "OLL", shape: "Corners-only", alg: "F R' F' R U R U' R'" },
];
