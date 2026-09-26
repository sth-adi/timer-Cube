import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { viewerMove } from "@/lib/gyro/orientation";
import { colorOnTopGrip } from "@/lib/xray/common";
import type { Solve } from "@/types";

/**
 * Colour-neutral solving. Every phase check in the app (cross, F2L pairs,
 * OLL, PLL, case recognition) is written for one frame: the cross on the
 * white (U) face. A solve built on any other colour is the same solve with
 * the colours relabelled — so it's analysed by relabelling its scramble and
 * moves through the whole-cube rotation that brings its cross colour to
 * white's place. Replays and scramble displays keep the real colours; only
 * analysis sees the relabelled copy.
 */

export const CROSS_FACES = ["U", "D", "F", "B", "R", "L"] as const;
export type CrossFace = (typeof CROSS_FACES)[number];

export const CROSS_FACE_COLOR: Record<CrossFace, string> = { U: "White", D: "Yellow", F: "Green", B: "Blue", R: "Red", L: "Orange" };
/** Sticker colours for drawing a cross glyph. */
export const CROSS_FACE_HEX: Record<CrossFace, string> = { U: "#f5f5f0", D: "#f7d51d", F: "#22a447", B: "#2563eb", R: "#dc2626", L: "#f97316" };

/** Edge slots (cubejs numbering) around each face's centre. */
const FACE_EDGES: Record<CrossFace, readonly number[]> = {
  U: [0, 1, 2, 3],
  D: [4, 5, 6, 7],
  F: [1, 5, 8, 9],
  B: [3, 7, 10, 11],
  R: [0, 4, 8, 11],
  L: [2, 6, 9, 10],
};

/** The cross on `face` is in place: its four edges home and flipped right (centres never move on a smart cube). */
export function crossSolvedOn(cube: CubeJSInstance, face: CrossFace): boolean {
  return FACE_EDGES[face].every((s) => cube.ep[s] === s && cube.eo[s] === 0);
}

const GRIPS = Object.fromEntries(CROSS_FACES.map((f) => [f, colorOnTopGrip(f)])) as Record<CrossFace, ReturnType<typeof colorOnTopGrip>>;

/** Tokens relabelled so `face`'s colour takes white's place (a no-op for white). */
export function toCrossFrame(tokens: readonly string[], face: CrossFace): string[] {
  return face === "U" ? [...tokens] : tokens.map((t) => viewerMove(t, GRIPS[face]));
}

export function relabelMove(token: string, face: CrossFace): string {
  return face === "U" ? token : viewerMove(token, GRIPS[face]);
}

const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"] as const;

/** Fixed, varied states used to read off how relabelling moves the stickers (see relabelFacelets) — enough that every sticker's path is unambiguous. */
const PROBES = Array.from({ length: 16 }, (_, k) => {
  let x = 2463534242 + k * 7919;
  const turns: string[] = [];
  for (let i = 0; i < 30; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const r = Math.abs(x);
    turns.push("URFDLB"[r % 6] + ["", "'", "2"][(r >> 3) % 3]);
  }
  return turns.join(" ");
});
const relabelMaps = new Map<CrossFace, { perm: number[]; color: Record<string, string> }>();

/**
 * Where each sticker goes, and what it's called, when a whole state is
 * relabelled for `face` — worked out once from how the relabelled moves
 * play out, so it's exactly consistent with toCrossFrame.
 */
function relabelMap(face: CrossFace) {
  const hit = relabelMaps.get(face);
  if (hit) return hit;
  const color = Object.fromEntries(FACE_LETTERS.map((x) => [x, relabelMove(x, face)[0]])) as Record<string, string>;
  const pairs = PROBES.map((seq) => {
    const a = newCube();
    a.move(seq);
    const b = newCube();
    b.move(toCrossFrame(seq.split(" "), face).join(" "));
    return [a.asString(), b.asString()] as const;
  });
  const perm = Array.from({ length: 54 }, (_, i) => {
    const js = Array.from({ length: 54 }, (_, k) => k).filter((k) => pairs.every(([src, dst]) => color[src[k]] === dst[i]));
    if (js.length !== 1) throw new Error("relabelling isn't a clean sticker permutation");
    return js[0];
  });
  const out = { perm, color };
  relabelMaps.set(face, out);
  return out;
}

/** A whole sticker state (Kociemba facelets) as seen with `face`'s colour in white's place. */
export function relabelFacelets(facelets: string, face: CrossFace): string {
  if (face === "U") return facelets;
  const { perm, color } = relabelMap(face);
  return perm.map((j) => color[facelets[j]]).join("");
}

/** The physical face a face letter in `face`'s frame really is (the inverse of relabelMove). */
export function physicalFace(frameFace: string, face: CrossFace): string {
  if (face === "U") return frameFace;
  return CROSS_FACES.find((f) => relabelMove(f, face) === frameFace) ?? frameFace;
}

const COLOR_WORD: Record<string, string> = { U: "white", D: "yellow", F: "green", B: "blue", R: "red", L: "orange" };
/** The four F2L pairs in the analysis frame, by the two side faces around each (same order as f2lPairSolved). */
const PAIR_FACES = [
  ["F", "R"],
  ["F", "L"],
  ["B", "L"],
  ["B", "R"],
] as const;

/** An F2L pair's real colours ("green-red") for a solve read in `face`'s frame. */
export function pairColors(pairIndex: number, face: CrossFace): string {
  return PAIR_FACES[pairIndex].map((f) => COLOR_WORD[physicalFace(f, face)]).join("-");
}

/**
 * The colour a solve's cross was built on: the first face whose cross is
 * complete after one of the solve's turns (white first on a tie). Null if
 * no cross ever forms.
 */
export function crossFaceOf(scramble: string, moves: readonly string[]): CrossFace | null {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  for (const m of moves) {
    cube.move(m);
    const face = CROSS_FACES.find((f) => crossSolvedOn(cube, f));
    if (face) return face;
  }
  return null;
}

const cache = new WeakMap<Solve, Solve>();

/**
 * The solve as analysis should see it: relabelled so its cross is on white.
 * The same object back for a white-cross solve (or one without a
 * reconstruction), so nothing changes for anyone who solves white.
 */
export function analysisFrame(solve: Solve): Solve {
  const hit = cache.get(solve);
  if (hit) return hit;
  let out = solve;
  if (solve.scramble && solve.reconstruction) {
    const moves = solve.reconstruction.split(/\s+/).filter(Boolean);
    const face = crossFaceOf(solve.scramble, moves);
    if (face && face !== "U") {
      out = {
        ...solve,
        scramble: toCrossFrame(solve.scramble.split(/\s+/).filter(Boolean), face).join(" "),
        reconstruction: toCrossFrame(moves, face).join(" "),
      };
    }
  }
  cache.set(solve, out);
  return out;
}
