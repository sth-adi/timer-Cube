import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { CORNER_FACELETS, EDGE_FACELETS, E_SLICE_EDGE_FACELETS, SOLVED_FACELET_STRING } from "@/lib/cube-engine/facePositions";
import { CORNER, EDGE } from "@/lib/cube-engine/engine";

/** The 4 cross edges — see engine.ts's doc comment: the solver's cross lives on U. */
const CROSS_EDGE_GROUPS: readonly (readonly number[])[] = [EDGE.UR, EDGE.UF, EDGE.UL, EDGE.UB].map((e) => EDGE_FACELETS[e]);

/** The 8 F2L pieces: the 4 U-layer corners plus the 4 equator edges. */
const F2L_PIECE_GROUPS: readonly (readonly number[])[] = [
  ...Object.values(CORNER_FACELETS),
  ...Object.values(E_SLICE_EDGE_FACELETS),
];

/**
 * Which facelets (by global 0-53 index) belong to a piece that's already
 * sitting fully solved — right position *and* orientation — after the
 * scramble, for the given set of piece groups. A piece counts as solved
 * only when *every* one of its stickers already matches the solved cube at
 * that exact position; checking just one sticker would call a flipped edge
 * "solved" because one of its two stickers happened to land on the right
 * color by coincidence.
 */
function highlightedFacelets(scrambledFacelets: string, groups: readonly (readonly number[])[]): Set<number> {
  const out = new Set<number>();
  for (const group of groups) {
    if (group.every((i) => scrambledFacelets[i] === SOLVED_FACELET_STRING[i])) {
      for (const i of group) out.add(i);
    }
  }
  return out;
}

/**
 * Facelets to highlight on a cross look-ahead icon: exactly the stickers of
 * whichever cross edges the scramble happened to already leave solved — the
 * classic "which pieces don't I need to hunt for" cross-planning cue.
 */
export function crossLookaheadFacelets(scramble: string): Set<number> {
  return highlightedFacelets(scrambleToFacelets(scramble), CROSS_EDGE_GROUPS);
}

/** Same idea, for the 8 F2L pieces (4 corners + 4 edges) instead of the 4 cross edges. */
export function f2lLookaheadFacelets(scramble: string): Set<number> {
  return highlightedFacelets(scrambleToFacelets(scramble), F2L_PIECE_GROUPS);
}

/** Slot order matching PostSolvePhaseRow.f2lPairIndex (0-3) — see f2lPairSolved in lib/solvers/oll.ts, the live detector this mirrors. */
const F2L_PAIR_CORNERS = [CORNER.URF, CORNER.UFL, CORNER.ULB, CORNER.UBR] as const;
const F2L_PAIR_EDGES = [EDGE.FR, EDGE.FL, EDGE.BL, EDGE.BR] as const;

/**
 * The 5 global facelet indices (3 corner + 2 edge) belonging to F2L slot
 * `pairIndex` — unlike crossLookaheadFacelets/f2lLookaheadFacelets, this
 * isn't conditional on the piece actually being solved: a post-solve pair
 * icon shows *which slot this row is*, at the moment that slot just became
 * solved by construction, so there's nothing to check.
 */
export function f2lPairSlotFacelets(pairIndex: 0 | 1 | 2 | 3): number[] {
  return [...CORNER_FACELETS[F2L_PAIR_CORNERS[pairIndex]], ...E_SLICE_EDGE_FACELETS[F2L_PAIR_EDGES[pairIndex]]];
}
