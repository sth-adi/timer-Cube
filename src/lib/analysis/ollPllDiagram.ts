import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { CORNER_FACELETS, EDGE_FACELETS } from "@/lib/cube-engine/facePositions";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";

/** Community-standard OLL diagram convention: unoriented pieces (and, for OLL specifically, every side sticker regardless of orientation) read as neutral gray rather than a real color, since permutation doesn't matter for OLL recognition — only which way each piece faces. */
export const MUTED_GRAY = "#5b606c";

export interface DiagramArrow {
  kind: "corner" | "edge";
  /** Slot index 0-3 (CORNER.URF..UBR or EDGE.UR..UB) the piece is currently sitting in. */
  from: number;
  /** Slot index 0-3 this piece needs to move to. */
  to: number;
  /** A 2-cycle (straight swap) draws as one double-headed arrow instead of two overlapping single ones. */
  doubleHeaded: boolean;
}

export interface OllPllDiagram {
  /** Global facelet index (0-53) -> color to paint, for every facelet the diagram draws (the U block plus one row of each side face — see CaseIcon). */
  facelets: Record<number, string>;
  /** Empty for OLL — permutation is irrelevant to an OLL diagram by definition. */
  arrows: DiagramArrow[];
}

/** Decomposes a 4-slot permutation into cycles, collapsing 2-cycles into one double-headed arrow rather than two overlapping single ones. `perm[slot]` = which piece currently occupies that slot; a piece always belongs home at the slot matching its own value. Exported for direct unit testing of the cycle math, independent of cube geometry. */
export function buildArrows(perm: readonly number[], kind: "corner" | "edge"): DiagramArrow[] {
  const arrows: DiagramArrow[] = [];
  const visited = new Set<number>();
  for (let i = 0; i < 4; i++) {
    if (perm[i] === i || visited.has(i)) continue;
    if (perm[perm[i]] === i) {
      arrows.push({ kind, from: i, to: perm[i], doubleHeaded: true });
      visited.add(i);
      visited.add(perm[i]);
      continue;
    }
    let cur = i;
    do {
      arrows.push({ kind, from: cur, to: perm[cur], doubleHeaded: false });
      visited.add(cur);
      cur = perm[cur];
    } while (cur !== i);
  }
  return arrows;
}

/**
 * `setupAlg` is authored in the algorithm library's own last-layer-on-U
 * convention (see CaseIcon's doc comment) — applying it to a solved cube
 * puts the U layer in exactly the state the case diagram needs to show.
 */
function setupCube(setupAlg: string) {
  return cubeFromAlg(setupAlg);
}

/**
 * OLL diagram: the U-face sticker of each of the 8 last-layer pieces reads
 * as the target color when that piece is already oriented, gray otherwise —
 * the "dot/cross/fish/etc." shapes every OLL reference site draws. Every
 * side-strip sticker is always gray: OLL doesn't care about permutation at
 * all, so showing real colors there would just be noise.
 */
export function buildOllDiagram(setupAlg: string): OllPllDiagram {
  const cube = setupCube(setupAlg);
  // Community diagrams (SpeedCubeDB etc.) always draw the last layer's target
  // color as yellow, matching how a solver actually holds the cube — see
  // CubeViewer's "yellow-up" doc comment — even though this setup alg's own
  // convention treats the case as living on the engine's U face (white).
  const targetColor = FACELET_COLORS.D;
  // The U face's own center (facelet 4) never moves and belongs to no
  // piece, so nothing below ever assigns it a color — without this it'd
  // fall through to buildStickers' gray placeholder and look like a stray,
  // meaningless dark square in the middle of an otherwise legible diagram.
  const facelets: Record<number, string> = { 4: targetColor };

  for (const [cornerStr, [uFacelet, side1, side2]] of Object.entries(CORNER_FACELETS)) {
    const corner = Number(cornerStr);
    facelets[uFacelet] = cube.co[corner] === 0 ? targetColor : MUTED_GRAY;
    facelets[side1] = MUTED_GRAY;
    facelets[side2] = MUTED_GRAY;
  }
  for (const [edgeStr, [uFacelet, side]] of Object.entries(EDGE_FACELETS)) {
    const edge = Number(edgeStr);
    facelets[uFacelet] = cube.eo[edge] === 0 ? targetColor : MUTED_GRAY;
    facelets[side] = MUTED_GRAY;
  }

  return { facelets, arrows: [] };
}

/**
 * PLL diagram: orientation is already solved by definition (OLL happens
 * first), so the U face always reads as the target color — what's left to
 * show is permutation, via each side-strip sticker's *real* color (a
 * correctly-placed piece shows its home color; a misplaced one visibly
 * doesn't) plus arrows tracing exactly which pieces need to cycle where,
 * the signature look of every PLL reference diagram.
 */
export function buildPllDiagram(setupAlg: string): OllPllDiagram {
  const cube = setupCube(setupAlg);
  // See buildOllDiagram's matching comment — target color is always yellow.
  const targetColor = FACELET_COLORS.D;
  const raw = cube.asString();
  const facelets: Record<number, string> = { 4: targetColor }; // see buildOllDiagram's matching comment

  for (const [uFacelet, side1, side2] of Object.values(CORNER_FACELETS)) {
    facelets[uFacelet] = targetColor;
    facelets[side1] = FACELET_COLORS[raw[side1]] ?? MUTED_GRAY;
    facelets[side2] = FACELET_COLORS[raw[side2]] ?? MUTED_GRAY;
  }
  for (const [uFacelet, side] of Object.values(EDGE_FACELETS)) {
    facelets[uFacelet] = targetColor;
    facelets[side] = FACELET_COLORS[raw[side]] ?? MUTED_GRAY;
  }

  const arrows = [...buildArrows(cube.cp.slice(0, 4), "corner"), ...buildArrows(cube.ep.slice(0, 4), "edge")];
  return { facelets, arrows };
}
