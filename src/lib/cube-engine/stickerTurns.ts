/**
 * Where each of a facelet string's 54 stickers sits on a physical cube, and how a face turn moves
 * them — enough to draw a layer actually turning (see components/lab/TurnCube) and to work out which
 * turn took one facelet string to the next, without asking the solver engine.
 *
 * Coordinates are the CSS 3D ones the twin is drawn in: x to the right, y DOWN, z toward the viewer,
 * each in -1..1 per cubie. Facelets are in the usual order (U, R, F, D, L, B; nine each, row-major as
 * seen looking at the face head-on, U with its back edge at the top). stickerTurns.test.ts checks every
 * turn here against the engine, so this can't drift from what the cube reports.
 */

export type Vec3 = readonly [number, number, number];
export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export const FACES_IN_ORDER: readonly Face[] = ["U", "R", "F", "D", "L", "B"];

export interface Sticker {
  /** The cubie it's on, each coordinate -1, 0 or 1. */
  cubie: Vec3;
  /** Which way it faces. */
  normal: Vec3;
}

/** Position and facing of sticker `index` (0..53). */
function stickerAt(face: Face, r: number, c: number): Sticker {
  switch (face) {
    case "U":
      return { cubie: [-1 + c, -1, -1 + r], normal: [0, -1, 0] };
    case "R":
      return { cubie: [1, -1 + r, 1 - c], normal: [1, 0, 0] };
    case "F":
      return { cubie: [-1 + c, -1 + r, 1], normal: [0, 0, 1] };
    case "D":
      return { cubie: [-1 + c, 1, 1 - r], normal: [0, 1, 0] };
    case "L":
      return { cubie: [-1, -1 + r, -1 + c], normal: [-1, 0, 0] };
    case "B":
      return { cubie: [1 - c, -1 + r, -1], normal: [0, 0, -1] };
  }
}

export const STICKERS: readonly Sticker[] = FACES_IN_ORDER.flatMap((face) => Array.from({ length: 9 }, (_, i) => stickerAt(face, Math.floor(i / 3), i % 3)));

type Axis = 0 | 1 | 2;

interface FaceTurn {
  axis: Axis;
  /** The layer's coordinate on that axis. */
  layer: -1 | 1;
  /** Quarter turns of +90° (the CSS rotateX/Y/Z direction) that make one clockwise turn of this face. */
  cwQuarters: 1 | 3;
}

const FACE_TURNS: Record<Face, FaceTurn> = {
  R: { axis: 0, layer: 1, cwQuarters: 1 },
  L: { axis: 0, layer: -1, cwQuarters: 3 },
  U: { axis: 1, layer: -1, cwQuarters: 3 },
  D: { axis: 1, layer: 1, cwQuarters: 1 },
  F: { axis: 2, layer: 1, cwQuarters: 1 },
  B: { axis: 2, layer: -1, cwQuarters: 3 },
};

/** One +90° turn about an axis, as CSS rotateX/rotateY/rotateZ(90deg) maps a point. */
function quarter(v: Vec3, axis: Axis): Vec3 {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

function rotate(v: Vec3, axis: Axis, quarters: number): Vec3 {
  let out = v;
  for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) out = quarter(out, axis);
  return out;
}

const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const stickerIndex = (cubie: Vec3, normal: Vec3) => STICKERS.findIndex((s) => same(s.cubie, cubie) && same(s.normal, normal));

/** A face turn: `quarters` is 1 (clockwise), 2 (half) or -1 (counter-clockwise), as seen looking at the face. */
export interface TurnSpec {
  face: Face;
  quarters: 1 | 2 | -1;
}

/** "R" → {R, 1}, "U'" → {U, -1}, "F2" → {F, 2}. Null for anything that isn't one of the 18 face turns (slices, wide turns, rotations). */
export function parseTurn(token: string): TurnSpec | null {
  const m = /^([URFDLB])(2|')?$/.exec(token.trim());
  if (!m) return null;
  return { face: m[1] as Face, quarters: m[2] === "2" ? 2 : m[2] === "'" ? -1 : 1 };
}

export function turnToken(t: TurnSpec): string {
  return t.face + (t.quarters === 2 ? "2" : t.quarters === -1 ? "'" : "");
}

export interface TurnGeometry {
  axis: Axis;
  layer: -1 | 1;
  /** The CSS rotation of the turning layer, in degrees, for the whole turn (negative or positive about its axis). */
  degrees: number;
}

export function turnGeometry(t: TurnSpec): TurnGeometry {
  const f = FACE_TURNS[t.face];
  const sign = f.cwQuarters === 1 ? 1 : -1;
  return { axis: f.axis, layer: f.layer, degrees: sign * 90 * t.quarters };
}

const permutations = new Map<string, number[]>();

/** `perm[j]` is the sticker that ends up at position j after the turn, so next[j] = prev[perm[j]]. */
function permutationOf(t: TurnSpec): number[] {
  const key = turnToken(t);
  const hit = permutations.get(key);
  if (hit) return hit;
  const f = FACE_TURNS[t.face];
  const q = f.cwQuarters * (t.quarters === -1 ? 3 : t.quarters);
  const perm = STICKERS.map((_, j) => j);
  STICKERS.forEach((s, i) => {
    if (s.cubie[f.axis] !== f.layer) return;
    const to = stickerIndex(rotate(s.cubie, f.axis, q), rotate(s.normal, f.axis, q));
    perm[to] = i;
  });
  permutations.set(key, perm);
  return perm;
}

/** The facelet string after one face turn; unchanged for a token that isn't a face turn. */
export function applyTurn(facelets: string, token: string): string {
  const t = parseTurn(token);
  if (!t || facelets.length !== 54) return facelets;
  const perm = permutationOf(t);
  let out = "";
  for (let j = 0; j < 54; j++) out += facelets[perm[j]];
  return out;
}

const ALL_TURNS: TurnSpec[] = FACES_IN_ORDER.flatMap((face) => ([1, 2, -1] as const).map((quarters) => ({ face, quarters })));

/** The single face turn that takes `prev` to `next`, or null when none does (a re-sync, several turns at once, or the same state). */
export function inferTurn(prev: string, next: string): TurnSpec | null {
  if (prev.length !== 54 || next.length !== 54 || prev === next) return null;
  for (const t of ALL_TURNS) if (applyTurn(prev, turnToken(t)) === next) return t;
  return null;
}
