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
