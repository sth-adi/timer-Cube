import type { CubeJSInstance } from "@/lib/cube-engine/engine";

/**
 * Names the F2L case you had for a pair: where its corner and edge were,
 * and which way round, the moment you went to solve it.
 *
 * Every case is looked at the way you hold the cube (yellow up, green
 * front — the engine's cross-on-U cube turned by z2) and then turned so the
 * pair's slot is front-right, with the top layer turned so the corner (or,
 * if the corner's already in the slot, the edge) sits in the standard spot.
 * That makes the same case look identical wherever it came up, and gives
 * exactly the 41 standard F2L cases:
 *
 *   both on top            24   (corner at UFR: 3 twists × edge 4 spots × 2 flips)
 *   corner in slot, edge on top   6
 *   edge in slot, corner on top   6
 *   both in the slot              5   (6 minus solved)
 *
 * A piece sitting in a *different* slot isn't one of the 41 — that's
 * reported as its own "stuck in another slot" case.
 */

/**
 * Global facelet indices (blocks U R F D L B, 9 each, row-major as
 * `asString()` lays them out) for every piece position, in the standard
 * Kociemba layout. The U-layer and E-slice entries match facePositions.ts;
 * the D layer completes them (verified in f2lCase.test.ts).
 */
const CORNERS: Record<string, readonly [number, number, number]> = {
  URF: [8, 9, 20],
  UFL: [6, 18, 38],
  ULB: [0, 36, 47],
  UBR: [2, 45, 11],
  DFR: [29, 26, 15],
  DLF: [27, 44, 24],
  DBL: [33, 53, 42],
  DRB: [35, 17, 51],
};
const EDGES: Record<string, readonly [number, number]> = {
  UR: [5, 10],
  UF: [7, 19],
  UL: [3, 37],
  UB: [1, 46],
  DR: [32, 16],
  DF: [28, 25],
  DL: [30, 43],
  DB: [34, 52],
  FR: [23, 12],
  FL: [21, 41],
  BL: [50, 39],
  BR: [48, 14],
};
export const FACELET_POSITIONS = { CORNERS, EDGES };

const FACES = "URFDLB";
const faceOf = (facelet: number) => FACES[Math.floor(facelet / 9)];
const F_CENTER = 22;
const R_CENTER = 13;
/** The cross colour (white) — U in the engine's own lettering, whichever face it's on now. */
const CROSS = "U";
/** Each engine F2L slot's two side colours (slot order 0-3 as f2lPairSolved numbers them). */
const PAIR_COLOURS = [["R", "F"], ["F", "L"], ["L", "B"], ["B", "R"]] as const;

export interface F2lCase {
  /** Stable identity — the same case always gets the same key. */
  key: string;
  name: string;
  /** "standard" is one of the 41; "other-slot" has a piece stuck in another slot. */
  kind: "standard" | "other-slot";
  /** The cube as you'd see it with this case in front of you (slot at front-right), for drawing. */
  facelets: string;
  /** The pair's five sticker positions in `facelets`. */
  pairFacelets: number[];
}

function find<T extends readonly number[]>(s: string, table: Record<string, T>, colours: string[]) {
  for (const [pos, idx] of Object.entries(table)) {
    const got = idx.map((i) => s[i]);
    if (got.length === colours.length && colours.every((c) => got.includes(c))) return { pos, idx };
  }
  return null;
}

/**
 * The case for F2L pair `pair` (0-3, engine slot order) on `cube`, an
 * engine-frame (cross on U) cube at the moment the pair was started. Null
 * when the cross isn't there to read against.
 */
export function recognizeF2lCase(cube: CubeJSInstance, pair: 0 | 1 | 2 | 3): F2lCase | null {
  const view = cube.clone();
  view.move("z2");
  // Turn the pair's slot to front-right.
  const colours: string[] = [...PAIR_COLOURS[pair]];
  for (let k = 0; k < 4; k++) {
    const s = view.asString();
    if (colours.includes(s[F_CENTER]) && colours.includes(s[R_CENTER])) break;
    view.move("y");
  }
  let s = view.asString();
  if (s[27 + 4] !== CROSS) return null; // cross colour should be on the bottom now
  const A = s[F_CENTER];
  const B = s[R_CENTER];
  // Line the top layer up: corner above the slot if it's on top, else the edge at the front.
  for (let j = 0; j < 4; j++) {
    const c = find(s, CORNERS, [CROSS, A, B]);
    const e = find(s, EDGES, [A, B]);
    if (c?.pos.startsWith("U")) {
      if (c.pos === "URF") break;
    } else if (e?.pos.startsWith("U")) {
      if (e.pos === "UF") break;
    } else break;
    view.move("U");
    s = view.asString();
  }

  const corner = find(s, CORNERS, [CROSS, A, B])!;
  const edge = find(s, EDGES, [A, B])!;
  const pairFacelets = [...corner.idx, ...edge.idx];
  const whiteFace = faceOf(corner.idx.find((i) => s[i] === CROSS)!);
  const aFace = faceOf(edge.idx.find((i) => s[i] === A)!);
  const key = `${corner.pos}:${whiteFace}|${edge.pos}:${aFace}`;

  const cornerTop = corner.pos === "URF";
  const cornerSlot = corner.pos === "DFR";
  const edgeTop = edge.pos.startsWith("U");
  const edgeSlot = edge.pos === "FR";
  if ((!cornerTop && !cornerSlot) || (!edgeTop && !edgeSlot)) {
    return { key: "other-slot", name: "Piece stuck in another slot", kind: "other-slot", facelets: s, pairFacelets };
  }

  const white = cornerTop
    ? { U: "white up", F: "white front", R: "white right" }[whiteFace]
    : { D: "corner in slot", F: "corner in slot, white front", R: "corner in slot, white right" }[whiteFace];
  let edgeText: string;
  if (edgeSlot) {
    edgeText = aFace === "F" ? "edge in slot" : "edge flipped in slot";
  } else {
    const spot = { UF: "front", UR: "right", UB: "back", UL: "left" }[edge.pos];
    const onTop = aFace === "U" ? "front colour" : "right colour";
    edgeText = cornerTop ? `edge ${spot}, ${onTop} up` : `edge on top, ${onTop} up`;
  }
  const name = `${white!.charAt(0).toUpperCase()}${white!.slice(1)} · ${edgeText}`;
  return { key, name, kind: "standard", facelets: s, pairFacelets };
}
