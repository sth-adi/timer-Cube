import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { isPllSkip, recognizeOll, recognizePll } from "@/lib/analysis/recognize";
import { findCase } from "@/lib/algorithms/caseLookup";
import { HOME_ORIENTATION, mul, tokenMatrix, type Mat3 } from "@/lib/gyro/orientation";
import { colorOnTopGrip, inGrip, invertMoves } from "@/lib/xray/common";
import { simplify, toPhysicalTurns } from "./route";

/**
 * Alg Identifier: do any sequence on the smart cube and find out what it
 * *is*. Everything is derived from the sequence's effect — the permutation
 * it applies to the cube, which doesn't depend on where you started — so it
 * works from solved, mid-solve, anywhere:
 *
 *  - which last-layer case it solves (OLL / PLL), and whether it's the book
 *    algorithm or your own variant;
 *  - whether it keeps F2L intact, and on which face it works;
 *  - exactly which pieces it cycles, twists and flips;
 *  - its order (how many repetitions bring the cube back);
 *  - move counts and how fast you executed it.
 */

const FACE_COLOR: Record<string, string> = { U: "White", D: "Yellow", F: "Green", B: "Blue", R: "Red", L: "Orange" };
const CORNER_FACES = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const EDGE_FACES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];

/** Engine face letters of the pieces in each face's layer. */
const LAYER: Record<string, { corners: number[]; edges: number[] }> = (() => {
  const out: Record<string, { corners: number[]; edges: number[] }> = {};
  for (const f of ["U", "D", "F", "B", "R", "L"]) {
    out[f] = {
      corners: CORNER_FACES.map((n, i) => (n.includes(f) ? i : -1)).filter((i) => i >= 0),
      edges: EDGE_FACES.map((n, i) => (n.includes(f) ? i : -1)).filter((i) => i >= 0),
    };
  }
  return out;
})();

export function pieceName(kind: "corner" | "edge", index: number): string {
  const faces = kind === "corner" ? CORNER_FACES[index] : EDGE_FACES[index];
  return faces
    .split("")
    .map((f) => FACE_COLOR[f])
    .join("-");
}

export interface PieceEffect {
  /** Cycles of pieces, each listed in the order they move (a → b means a goes where b was). */
  cornerCycles: string[][];
  edgeCycles: string[][];
  /** Pieces that stay put but twist / flip. */
  twisted: string[];
  flipped: string[];
  movedCount: number;
}

export type AlgKind = "identity" | "oll" | "pll" | "auf" | "other";

export interface AlgIdentity {
  turns: string[];
  /** Notation with the worked-on face on top, rotated so the first side turn is R. */
  notation: string;
  htm: number;
  qtm: number;
  durationMs: number;
  tps: number | null;
  order: number;
  /** The single layer every changed piece lives in (e.g. "D" = yellow), or null. */
  layer: string | null;
  kind: AlgKind;
  caseName: string | null;
  /** The book algorithm for that case, and whether this matches it. */
  bookAlg: string | null;
  isBookAlg: boolean;
  effect: PieceEffect;
}

function effectCube(turns: readonly string[]): CubeJSInstance {
  const c = newCube();
  if (turns.length) c.move(turns.join(" "));
  return c;
}

function cycles(perm: readonly number[], kind: "corner" | "edge"): string[][] {
  const seen = new Set<number>();
  const out: string[][] = [];
  for (let start = 0; start < perm.length; start++) {
    if (seen.has(start) || perm[start] === start) continue;
    // perm[pos] = the piece now at pos. Follow a piece to where it went.
    const cycle: string[] = [];
    let piece = start;
    while (!seen.has(piece)) {
      seen.add(piece);
      cycle.push(pieceName(kind, piece));
      piece = perm.indexOf(piece); // the position `piece` moved to — whose original occupant moves next
    }
    out.push(cycle);
  }
  return out;
}

export function pieceEffect(cube: CubeJSInstance): PieceEffect {
  const twisted = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => cube.cp[i] === i && cube.co[i] !== 0).map((i) => pieceName("corner", i));
  const flipped = Array.from({ length: 12 }, (_, i) => i).filter((i) => cube.ep[i] === i && cube.eo[i] !== 0).map((i) => pieceName("edge", i));
  const cornerCycles = cycles(cube.cp, "corner");
  const edgeCycles = cycles(cube.ep, "edge");
  return {
    cornerCycles,
    edgeCycles,
    twisted,
    flipped,
    movedCount: cornerCycles.flat().length + edgeCycles.flat().length + twisted.length + flipped.length,
  };
}

function changedPieces(cube: CubeJSInstance): { corners: number[]; edges: number[] } {
  return {
    corners: [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => cube.cp[i] !== i || cube.co[i] !== 0),
    edges: Array.from({ length: 12 }, (_, i) => i).filter((i) => cube.ep[i] !== i || cube.eo[i] !== 0),
  };
}

/** The one face whose layer contains every changed piece, if there is one. */
function affectedLayer(cube: CubeJSInstance): string | null {
  const { corners, edges } = changedPieces(cube);
  if (corners.length + edges.length === 0) return null;
  return (
    ["D", "U", "F", "B", "R", "L"].find((f) => corners.every((c) => LAYER[f].corners.includes(c)) && edges.every((e) => LAYER[f].edges.includes(e))) ??
    null
  );
}

/** How many times the sequence must be repeated to return the cube to where it started. */
export function orderOf(turns: readonly string[]): number {
  const once = effectCube(turns);
  const c = once.clone();
  for (let n = 1; n <= 1260; n++) {
    if (c.isSolved()) return n;
    c.multiply(once);
  }
  return 1260;
}

/** Yellow-/any-face-on-top notation: the 4 grips with `top` up, choosing the one that makes the first side turn an R. */
export function canonicalNotation(turns: readonly string[], top: string): string[] {
  const base = colorOnTopGrip(top);
  const y = tokenMatrix("y");
  let grip: Mat3 = base;
  const firstSide = (mapped: string[]) => mapped.find((t) => t[0] !== "U" && t[0] !== "D");
  for (let k = 0; k < 4; k++) {
    const mapped = inGrip(turns, grip);
    const side = firstSide(mapped);
    if (!side || side[0] === "R") return mapped;
    grip = mul(y, grip);
  }
  return inGrip(turns, base);
}

function quarterCount(turns: readonly string[]): number {
  return turns.reduce((n, t) => n + (t.endsWith("2") ? 2 : 1), 0);
}

export function identifyAlg(rawTurns: readonly string[], timesMs: readonly number[] = []): AlgIdentity {
  const turns = simplify(rawTurns);
  const effect = effectCube(turns);
  const layer = affectedLayer(effect);
  const durationMs = timesMs.length > 1 ? timesMs[timesMs.length - 1] - timesMs[0] : 0;
  const base = {
    turns,
    htm: turns.length,
    qtm: quarterCount(turns),
    durationMs,
    tps: durationMs > 0 ? ((rawTurns.length - 1) / durationMs) * 1000 : null,
    order: orderOf(turns),
    layer,
    effect: pieceEffect(effect),
  };

  if (effect.isSolved()) {
    return { ...base, notation: canonicalNotation(turns, "D").join(" "), kind: "identity", caseName: null, bookAlg: null, isBookAlg: false };
  }

  const top = layer ?? "D";
  const notation = canonicalNotation(turns, top);
  if (!layer) {
    return { ...base, notation: notation.join(" "), kind: "other", caseName: null, bookAlg: null, isBookAlg: false };
  }

  // The case this solves: undo it from solved, viewed with its layer on top
  // (which is exactly the algorithm library's frame).
  const caseState = newCube();
  caseState.move(invertMoves(inGrip(turns, colorOnTopGrip(layer))).join(" "));
  const oriented = [0, 1, 2, 3].every((i) => caseState.co[i] === 0) && [0, 1, 2, 3].every((i) => caseState.eo[i] === 0);

  let kind: AlgKind;
  let caseName: string | null = null;
  if (oriented && isPllSkip(caseState)) {
    kind = "auf";
  } else if (oriented) {
    kind = "pll";
    caseName = recognizePll(caseState)?.case.name ?? null;
  } else {
    kind = "oll";
    caseName = recognizeOll(caseState)?.case.name ?? null;
  }
  const group = kind === "pll" ? "PLL" : "OLL";
  const bookAlg = caseName ? (findCase(group, caseName)?.alg ?? null) : null;
  const bookNotation = bookAlg ? canonicalNotation(toPhysicalTurns(bookAlg, HOME_ORIENTATION).turns, "D").join(" ") : null;
  const isBookAlg = bookNotation !== null && bookNotation === canonicalNotation(turns, layer).join(" ");
  return {
    ...base,
    notation: notation.join(" "),
    kind,
    caseName,
    bookAlg,
    isBookAlg,
  };
}
