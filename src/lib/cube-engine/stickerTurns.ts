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

export type Axis = 0 | 1 | 2;

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

function faceToken(t: TurnSpec): string {
  return t.face + (t.quarters === 2 ? "2" : t.quarters === -1 ? "'" : "");
}

/** The token of a move: "R'", and for the later additions (a slice, rotation or pair) the same as moveToken. */
export function turnToken(t: MoveSpec): string {
  return isFaceMove(t) ? faceToken(t) : moveToken(t);
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

/** A middle-layer turn (M, E, S: the three layers between the two outer faces) or a whole-cube rotation (x, y, z). */
export interface SliceSpec {
  slice: "M" | "E" | "S" | "x" | "y" | "z";
  quarters: 1 | 2 | -1;
}

/**
 * Two opposite faces turned together the same way round, the shape a middle-slice turn arrives in from a real
 * smart cube (R' with L, which cannot report M itself; see lib/smartcube/slicePair). The cube state is exactly
 * those two face turns; drawn, it is one turn: both outer layers swing round while the middle one stays,
 * which looks like the slice turning against them. `lag` (0..1, default 0) is how far into the turn the
 * second layer set off, for a second half that arrives after the first has already begun.
 */
export interface PairSpec {
  pair: readonly [TurnSpec, TurnSpec];
  lag?: number;
}

/** Anything the cube can be seen doing in one go. A TurnSpec stays what it always was; the others are additions. */
export type MoveSpec = TurnSpec | SliceSpec | PairSpec;

export const isPairMove = (m: MoveSpec): m is PairSpec => "pair" in m;
export const isSliceMove = (m: MoveSpec): m is SliceSpec => "slice" in m;
export const isFaceMove = (m: MoveSpec): m is TurnSpec => "face" in m;

interface SliceDef {
  axis: Axis;
  layers: readonly (-1 | 0 | 1)[];
  /** +1 or -1: which way one clockwise quarter of this move turns about its axis, in CSS terms (the sign of the face it follows). */
  sign: 1 | -1;
}

/** M follows L, E follows D, S follows F; x follows R, y follows U, z follows F (WCA notation). stickerTurns.test.ts pins each against the engine. */
const SLICE_DEFS: Record<SliceSpec["slice"], SliceDef> = {
  M: { axis: 0, layers: [0], sign: -1 },
  E: { axis: 1, layers: [0], sign: 1 },
  S: { axis: 2, layers: [0], sign: 1 },
  x: { axis: 0, layers: [-1, 0, 1], sign: 1 },
  y: { axis: 1, layers: [-1, 0, 1], sign: -1 },
  z: { axis: 2, layers: [-1, 0, 1], sign: 1 },
};

/** "M" → {M, 1}, "x'" → {x, -1}, "E2" → {E, 2}. Null for anything else (including face turns; see parseTurn). */
export function parseSlice(token: string): SliceSpec | null {
  const m = /^([MESxyz])(2|')?$/.exec(token.trim());
  if (!m) return null;
  return { slice: m[1] as SliceSpec["slice"], quarters: m[2] === "2" ? 2 : m[2] === "'" ? -1 : 1 };
}

/** One of the 18 face turns, or a slice turn or rotation (M E S x y z with ' or 2). */
export function parseMove(token: string): TurnSpec | SliceSpec | null {
  return parseTurn(token) ?? parseSlice(token);
}

/** The two-face pair of a slice-shaped turn, or null when `a` and `b` are not opposite faces turning the same way round. */
export function pairOf(a: TurnSpec, b: TurnSpec): PairSpec | null {
  const ga = turnGeometry(a);
  const gb = turnGeometry(b);
  const turned = (d: number) => ((d % 360) + 360) % 360;
  if (ga.axis !== gb.axis || ga.layer === gb.layer || turned(ga.degrees) !== turned(gb.degrees)) return null;
  return { pair: [a, b] };
}

/** The move as the engine-style token(s) that make up its cube state: "R", "M'", "x2", or "R' L" for a pair. */
export function moveToken(m: MoveSpec): string {
  if (isPairMove(m)) return `${faceToken(m.pair[0])} ${faceToken(m.pair[1])}`;
  if (isSliceMove(m)) return m.slice + (m.quarters === 2 ? "2" : m.quarters === -1 ? "'" : "");
  return faceToken(m);
}

/** One group of cubies turning together: the layers (by coordinate on `axis`), how far round they go in all, and when they set off (0..1 of the move). */
export interface MovePart {
  layers: readonly (-1 | 0 | 1)[];
  degrees: number;
  lag: number;
}

export interface MoveGeometry {
  axis: Axis;
  parts: readonly MovePart[];
}

/** Which cubies turn, about which axis, how far, for any move. A pair is one part unless its second half lags. */
export function moveGeometry(m: MoveSpec): MoveGeometry {
  if (isPairMove(m)) {
    const a = turnGeometry(m.pair[0]);
    const b = turnGeometry(m.pair[1]);
    const lag = Math.max(0, Math.min(0.95, m.lag ?? 0));
    if (lag === 0) return { axis: a.axis, parts: [{ layers: [a.layer, b.layer], degrees: a.degrees, lag: 0 }] };
    return {
      axis: a.axis,
      parts: [
        { layers: [a.layer], degrees: a.degrees, lag: 0 },
        { layers: [b.layer], degrees: a.degrees, lag },
      ],
    };
  }
  if (isSliceMove(m)) {
    const d = SLICE_DEFS[m.slice];
    return { axis: d.axis, parts: [{ layers: d.layers, degrees: d.sign * 90 * m.quarters, lag: 0 }] };
  }
  const g = turnGeometry(m);
  return { axis: g.axis, parts: [{ layers: [g.layer], degrees: g.degrees, lag: 0 }] };
}

const permutations = new Map<string, number[]>();

/** `perm[j]` is the sticker that ends up at position j after rotating `layers` of `axis` by `q` quarters of +90°, so next[j] = prev[perm[j]]. */
function layerPermutation(axis: Axis, layers: readonly number[], q: number): number[] {
  const key = `${axis}:${layers.join(",")}:${((q % 4) + 4) % 4}`;
  const hit = permutations.get(key);
  if (hit) return hit;
  const perm = STICKERS.map((_, j) => j);
  STICKERS.forEach((s, i) => {
    if (!layers.includes(s.cubie[axis])) return;
    const to = stickerIndex(rotate(s.cubie, axis, q), rotate(s.normal, axis, q));
    perm[to] = i;
  });
  permutations.set(key, perm);
  return perm;
}

function permutationOf(t: TurnSpec): number[] {
  const f = FACE_TURNS[t.face];
  return layerPermutation(f.axis, [f.layer], f.cwQuarters * (t.quarters === -1 ? 3 : t.quarters));
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

/**
 * The facelet string after any move token: a face turn, a slice turn or rotation (M E S x y z), or several of
 * them separated by spaces ("R' L"). Unchanged for a token it does not know. Slice turns and rotations move the
 * centre stickers too, exactly as the engine's own do.
 */
export function applyMove(facelets: string, token: string): string {
  if (facelets.length !== 54) return facelets;
  let out = facelets;
  for (const part of token.trim().split(/\s+/)) {
    const m = parseMove(part);
    if (!m) continue;
    let perm: number[];
    if (isSliceMove(m)) {
      const d = SLICE_DEFS[m.slice];
      perm = layerPermutation(d.axis, d.layers, d.sign * m.quarters);
    } else perm = permutationOf(m);
    let next = "";
    for (let j = 0; j < 54; j++) next += out[perm[j]];
    out = next;
  }
  return out;
}

const SLICE_TURNS: SliceSpec[] = (["M", "E", "S", "x", "y", "z"] as const).flatMap((slice) => ([1, 2, -1] as const).map((quarters) => ({ slice, quarters })));

const OPPOSITE_PAIRS: readonly (readonly [Face, Face])[] = [
  ["R", "L"],
  ["U", "D"],
  ["F", "B"],
];
const SLICE_PAIRS: PairSpec[] = OPPOSITE_PAIRS.flatMap(([a, b]) =>
  ([1, 2, -1] as const).flatMap((qa) =>
    ([1, 2, -1] as const).flatMap((qb) => {
      const pair = pairOf({ face: a, quarters: qa }, { face: b, quarters: qb });
      return pair ? [pair] : [];
    }),
  ),
);

/**
 * The one move that takes `prev` to `next`: a face turn, else a middle-layer turn or whole-cube rotation, else
 * two opposite faces turned together the same way round (what a real M/E/S looks like from a smart cube).
 * Null when none does (a re-sync, several unrelated turns, the same state).
 */
export function inferMove(prev: string, next: string): MoveSpec | null {
  const face = inferTurn(prev, next);
  if (face) return face;
  if (prev.length !== 54 || next.length !== 54 || prev === next) return null;
  for (const t of SLICE_TURNS) if (applyMove(prev, moveToken(t)) === next) return t;
  for (const p of SLICE_PAIRS) if (applyMove(prev, moveToken(p)) === next) return p;
  return null;
}
