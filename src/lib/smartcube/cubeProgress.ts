import { FACES_IN_ORDER, STICKERS, type Vec3 } from "@/lib/cube-engine/stickerTurns";
import { CROSS_FACES, type CrossFace } from "./crossFrame";

/**
 * Progress drawn on the cube itself: while a solve is live, which pieces of the CURRENT stage are already
 * home, so the 3D cube can dim the ones that are not (cross edges, then each F2L slot's corner + edge pair,
 * then last-layer orientation, then last-layer position) and visibly fill in as the phases land.
 *
 * It reads a physical facelet string directly (smart cubes never move their centres, so a sticker is home when
 * it matches the centre of the face it sits on) and follows the same definitions as lib/smartcube/milestones:
 * the cross is the first face whose four edges are home and flipped right (CROSS_FACES order, white first),
 * F2L is the whole first layer, OLL is the opposite layer facing the cross colour, and a stage never goes
 * backwards once reached (a pair knocked loose later does not un-finish F2L). The caller keeps the
 * `CubeProgress` between turns (advanceProgress returns the same object when nothing changed).
 */

export type ProgressStage = "none" | "cross" | "f2l" | "oll" | "pll";

export interface CubeProgress {
  /** The face the cross was built on, once one has completed. */
  crossFace: CrossFace | null;
  /** Before any cross completes: the face that looks to be getting one (at least two edges home), so the cross can fill in. */
  leaning: CrossFace | null;
  f2lDone: boolean;
  ollDone: boolean;
}

export const NO_PROGRESS: CubeProgress = { crossFace: null, leaning: null, f2lDone: false, ollDone: false };

/** Home edges a face needs before the cross is shown filling in on it (one is as likely by chance as not). */
const LEAN_EDGES = 2;

const FACE_NORMAL: Record<CrossFace, Vec3> = { U: [0, -1, 0], D: [0, 1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };

interface Piece {
  /** Sticker indices (2 for an edge, 3 for a corner). */
  stickers: number[];
  cubie: Vec3;
}

/** The 20 pieces (12 edges, 8 corners), keyed by cubie coordinates. */
const PIECES: Map<string, Piece> = (() => {
  const map = new Map<string, Piece>();
  STICKERS.forEach((s, i) => {
    const [x, y, z] = s.cubie;
    if (x === 0 && y === 0 && z === 0) return;
    if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 2) return; // a centre
    const key = s.cubie.join(",");
    const piece = map.get(key) ?? { stickers: [], cubie: s.cubie };
    piece.stickers.push(i);
    map.set(key, piece);
  });
  return map;
})();

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nonzero = (c: Vec3) => (c[0] !== 0 ? 1 : 0) + (c[1] !== 0 ? 1 : 0) + (c[2] !== 0 ? 1 : 0);
const faceOf = (sticker: number) => FACES_IN_ORDER[Math.floor(sticker / 9)];

/** Every sticker of the piece shows the colour of the face it is on: it is home and flipped right (centres do not move). */
function pieceHome(facelets: string, piece: Piece): boolean {
  return piece.stickers.every((i) => facelets[i] === faceOf(i));
}

interface FramePieces {
  crossEdges: Piece[];
  /** Corner + the middle-layer edge beside it, for each of the four slots. */
  pairs: Piece[][];
  /** The opposite layer's four edges and four corners. */
  lastLayer: Piece[];
  /** For each last-layer piece, its sticker that faces the opposite face (the one OLL is about). */
  lastLayerTop: Map<Piece, number>;
}

const frames = new Map<CrossFace, FramePieces>();

function framePieces(face: CrossFace): FramePieces {
  const hit = frames.get(face);
  if (hit) return hit;
  const n = FACE_NORMAL[face];
  const crossEdges: Piece[] = [];
  const corners: Piece[] = [];
  const middleEdges: Piece[] = [];
  const lastLayer: Piece[] = [];
  const lastLayerTop = new Map<Piece, number>();
  for (const piece of PIECES.values()) {
    const layer = dot(piece.cubie, n);
    const count = nonzero(piece.cubie);
    if (layer === 1) (count === 2 ? crossEdges : corners).push(piece);
    else if (layer === 0) middleEdges.push(piece);
    else {
      lastLayer.push(piece);
      const top = piece.stickers.find((i) => dot(STICKERS[i].normal, n) === -1);
      if (top !== undefined) lastLayerTop.set(piece, top);
    }
  }
  const pairs = corners.map((corner) => {
    // The edge beside a corner is the middle-layer piece with the same two side coordinates.
    const edge = middleEdges.find((e) => e.cubie.every((v, k) => (n[k] !== 0 ? true : v === corner.cubie[k])));
    return edge ? [corner, edge] : [corner];
  });
  const out = { crossEdges, pairs, lastLayer, lastLayerTop };
  frames.set(face, out);
  return out;
}

const homeCount = (facelets: string, pieces: readonly Piece[]) => pieces.reduce((n, p) => n + (pieceHome(facelets, p) ? 1 : 0), 0);

/** The cross on `face` is home (the same test as crossSolvedOn, read off the facelets). */
export function crossHome(facelets: string, face: CrossFace): boolean {
  return homeCount(facelets, framePieces(face).crossEdges) === 4;
}

function firstLayerHome(facelets: string, face: CrossFace): boolean {
  const f = framePieces(face);
  return homeCount(facelets, f.crossEdges) === 4 && f.pairs.every((pair) => pair.every((p) => pieceHome(facelets, p)));
}

/** Every last-layer sticker on the opposite face shows its colour (permutation ignored). */
function lastLayerOriented(facelets: string, face: CrossFace): boolean {
  const f = framePieces(face);
  return [...f.lastLayerTop.values()].every((i) => facelets[i] === faceOf(i));
}

/**
 * Moves the progress forward for the cube as it now stands. Stages only ever advance: once the cross
 * face is picked, or F2L / OLL reached, they stay. Returns `progress` itself when nothing changed, so
 * callers can keep it in state without extra renders.
 */
export function advanceProgress(progress: CubeProgress, facelets: string): CubeProgress {
  if (facelets.length !== 54) return progress;
  let { crossFace, leaning, f2lDone, ollDone } = progress;
  if (crossFace === null) {
    crossFace = CROSS_FACES.find((f) => crossHome(facelets, f)) ?? null;
    if (crossFace === null) {
      // Stay on the face already leaned on until another has strictly more edges home.
      const count = (f: CrossFace) => homeCount(facelets, framePieces(f).crossEdges);
      let bestCount = leaning !== null ? count(leaning) : LEAN_EDGES - 1;
      for (const f of CROSS_FACES) {
        const c = count(f);
        if (c > bestCount && c >= LEAN_EDGES) {
          leaning = f;
          bestCount = c;
        }
      }
    } else leaning = null;
  }
  if (crossFace !== null) {
    if (!f2lDone && firstLayerHome(facelets, crossFace)) f2lDone = true;
    if (!ollDone && f2lDone && firstLayerHome(facelets, crossFace) && lastLayerOriented(facelets, crossFace)) ollDone = true;
  }
  if (crossFace === progress.crossFace && leaning === progress.leaning && f2lDone === progress.f2lDone && ollDone === progress.ollDone) return progress;
  return { crossFace, leaning, f2lDone, ollDone };
}

export function stageOf(progress: CubeProgress): ProgressStage {
  if (progress.crossFace === null) return progress.leaning === null ? "none" : "cross";
  if (!progress.f2lDone) return "f2l";
  return progress.ollDone ? "pll" : "oll";
}

/**
 * The stickers still to be put right for the current stage, as a 54-entry list (true = not there yet), or
 * null when there is nothing to show: no stage yet, or every piece of the stage is already home.
 * Pieces outside the stage are left alone. During F2L a slot counts as one thing: if either its corner or
 * its edge is out, both are marked.
 */
export function pendingStickers(progress: CubeProgress, facelets: string): boolean[] | null {
  const stage = stageOf(progress);
  if (stage === "none" || facelets.length !== 54) return null;
  const face = progress.crossFace ?? progress.leaning;
  if (face === null) return null;
  const f = framePieces(face);
  const out = new Array<boolean>(54).fill(false);
  let any = false;
  const mark = (piece: Piece) => {
    for (const i of piece.stickers) out[i] = true;
    any = true;
  };
  if (stage === "cross" || stage === "f2l") {
    for (const p of f.crossEdges) if (!pieceHome(facelets, p)) mark(p);
  }
  if (stage === "f2l") {
    for (const pair of f.pairs) if (!pair.every((p) => pieceHome(facelets, p))) pair.forEach(mark);
  } else if (stage === "oll") {
    for (const p of f.lastLayer) {
      const top = f.lastLayerTop.get(p);
      if (top !== undefined && facelets[top] !== faceOf(top)) mark(p);
    }
  } else if (stage === "pll") {
    for (const p of f.lastLayer) if (!pieceHome(facelets, p)) mark(p);
  }
  return any ? out : null;
}
