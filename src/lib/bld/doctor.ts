import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CORNER_LETTER, EDGE_LETTER, letterName } from "@/lib/analysis/bldLettering";
import { pieceName } from "@/lib/smartcube/algId";

/**
 * BLD Doctor: a blindfolded attempt on a smart cube is recorded turn by
 * turn, so a DNF doesn't have to stay a mystery. Blind solvers execute one
 * target (or one commutator) at a time with a pause between each, so the
 * move stream splits naturally into chunks — and after every chunk we know
 * exactly which pieces were solved. That answers what no blindfold ever
 * could:
 *
 *  - which pieces ended unsolved, by color and by Speffz letter;
 *  - *which chunk* broke each of them (or that one was never solved — a
 *    memo or execution skip);
 *  - what the final state looks like: unfixed parity, a lone twist or flip,
 *    a leftover cycle.
 */

/** Blind solvers pause between targets; a gap this long ends a chunk. */
export const CHUNK_PAUSE_MS = 400;

export interface BldPiece {
  kind: "corner" | "edge";
  index: number;
  /** Sticker colors, e.g. "White-Red-Green". */
  name: string;
  /** Speffz letter of the piece's U/D (or F/B) sticker. */
  letter: string;
}

export type PieceIssue = "twisted" | "flipped" | "misplaced";

export interface UnsolvedPiece {
  piece: BldPiece;
  issue: PieceIssue;
  /** Chunk index (0-based) after which this piece stopped being solved for the last time, or null if it was never solved. */
  brokenInChunk: number | null;
}

export interface BldChunk {
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  /** Pieces (of 20) solved once this chunk finished. */
  solvedAfter: number;
}

export interface BldDiagnosis {
  solved: boolean;
  chunks: BldChunk[];
  /** Solved pieces before the first turn. */
  solvedAtStart: number;
  unsolved: UnsolvedPiece[];
  /** The earliest chunk that broke a piece which then stayed broken. */
  firstBadChunk: number | null;
  verdict: string;
  detail: string;
}

function pieceOf(kind: "corner" | "edge", index: number): BldPiece {
  const letterIndex = kind === "corner" ? CORNER_LETTER[index][0] : EDGE_LETTER[index][0];
  return { kind, index, name: pieceName(kind, index), letter: letterName(letterIndex) };
}

const cornerSolved = (c: CubeJSInstance, i: number) => c.cp[i] === i && c.co[i] === 0;
const edgeSolved = (c: CubeJSInstance, i: number) => c.ep[i] === i && c.eo[i] === 0;

function solvedCount(c: CubeJSInstance): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (cornerSolved(c, i)) n++;
  for (let i = 0; i < 12; i++) if (edgeSolved(c, i)) n++;
  return n;
}

function splitChunks(timesMs: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= timesMs.length; i++) {
    if (i === timesMs.length || timesMs[i] - timesMs[i - 1] >= CHUNK_PAUSE_MS) {
      out.push([start, i - 1]);
      start = i;
    }
  }
  return out;
}

function verdictFor(unsolved: UnsolvedPiece[]): { verdict: string; detail: string } {
  if (unsolved.length === 0) return { verdict: "Solved!", detail: "Every piece home." };
  const misplacedCorners = unsolved.filter((u) => u.piece.kind === "corner" && u.issue === "misplaced").length;
  const misplacedEdges = unsolved.filter((u) => u.piece.kind === "edge" && u.issue === "misplaced").length;
  const twisted = unsolved.filter((u) => u.issue === "twisted").length;
  const flipped = unsolved.filter((u) => u.issue === "flipped").length;
  if (misplacedCorners === 2 && misplacedEdges === 2 && twisted + flipped === 0) {
    return { verdict: "Parity wasn't fixed", detail: "Exactly two corners and two edges are swapped — the classic sign of an odd number of targets without the parity algorithm." };
  }
  if (twisted > 0 && misplacedCorners + misplacedEdges + flipped === 0) {
    return {
      verdict: `${twisted} corner${twisted === 1 ? "" : "s"} twisted in place`,
      detail: "Everything is in the right place — only orientation is off. A twist target was skipped, or done the wrong way round.",
    };
  }
  if (flipped > 0 && misplacedCorners + misplacedEdges + twisted === 0) {
    return {
      verdict: `${flipped} edge${flipped === 1 ? "" : "s"} flipped in place`,
      detail: "Every edge is in its slot but some face the wrong way — a flip target was skipped or done twice.",
    };
  }
  if (misplacedCorners + misplacedEdges === 3 && twisted + flipped === 0) {
    return {
      verdict: `A 3-cycle of ${misplacedCorners === 3 ? "corners" : "edges"} is left`,
      detail: "One commutator was missed, or done inverted (which cycles the three the other way).",
    };
  }
  return {
    verdict: `${unsolved.length} pieces unsolved`,
    detail: `${misplacedCorners} corners and ${misplacedEdges} edges out of place, ${twisted} twisted, ${flipped} flipped — check the chunk where things started breaking.`,
  };
}

export function diagnoseBld(scramble: string, moves: readonly string[], timesMs: readonly number[]): BldDiagnosis {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const solvedAtStart = solvedCount(cube);

  // Which pieces are solved at the start and after each chunk.
  const snapshots: { corners: boolean[]; edges: boolean[] }[] = [];
  const snap = () => ({
    corners: Array.from({ length: 8 }, (_, i) => cornerSolved(cube, i)),
    edges: Array.from({ length: 12 }, (_, i) => edgeSolved(cube, i)),
  });
  snapshots.push(snap());
  const chunks: BldChunk[] = [];
  for (const [a, b] of splitChunks(timesMs.slice(0, moves.length))) {
    for (let i = a; i <= b; i++) cube.move(moves[i]);
    snapshots.push(snap());
    chunks.push({ startIndex: a, endIndex: b, startMs: timesMs[a] ?? 0, endMs: timesMs[b] ?? 0, solvedAfter: solvedCount(cube) });
  }

  const unsolved: UnsolvedPiece[] = [];
  const check = (kind: "corner" | "edge", i: number, isSolved: boolean, issueInPlace: PieceIssue) => {
    if (isSolved) return;
    const inPlace = kind === "corner" ? cube.cp[i] === i : cube.ep[i] === i;
    // The last snapshot where it was solved; the chunk after that one broke it.
    let lastSolved = -1;
    for (let s = snapshots.length - 1; s >= 0; s--) {
      if ((kind === "corner" ? snapshots[s].corners : snapshots[s].edges)[i]) {
        lastSolved = s;
        break;
      }
    }
    unsolved.push({ piece: pieceOf(kind, i), issue: inPlace ? issueInPlace : "misplaced", brokenInChunk: lastSolved >= 0 ? lastSolved : null });
  };
  for (let i = 0; i < 8; i++) check("corner", i, cornerSolved(cube, i), "twisted");
  for (let i = 0; i < 12; i++) check("edge", i, edgeSolved(cube, i), "flipped");

  const broken = unsolved.map((u) => u.brokenInChunk).filter((c): c is number => c !== null && c < chunks.length);
  return {
    solved: unsolved.length === 0,
    chunks,
    solvedAtStart,
    unsolved,
    firstBadChunk: broken.length ? Math.min(...broken) : null,
    ...verdictFor(unsolved),
  };
}
