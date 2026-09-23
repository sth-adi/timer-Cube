import { Cube } from "@/lib/cube-engine/engine";
import {
  FACE_COLOR_NAMES,
  FACE_NORMALS,
  apply,
  orientationFromQuat,
  physicalFaceAt,
  type GyroCalibration,
  type GyroSample,
  type Quat,
} from "@/lib/gyro/orientation";

/**
 * Inspection Gaze. A gyro cube knows how it was held every moment of
 * inspection — so it knows which of its sides were actually turned toward
 * your eyes, and for how long. Put that next to where the scramble put the
 * four cross edges and you get something no timer has ever been able to
 * say: "you never looked at the blue side, and the white-blue edge was
 * sitting right there."
 *
 * Everything is in the body frame (white U, green F — the physical cube,
 * named by center color), the same frame the move stream and facelet
 * strings use.
 */

export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];

/**
 * The direction from the cube to your eyes, in the viewer frame: toward
 * you and a little above — cubes are held below eye level, so the top face
 * is in view too, just more obliquely than the front.
 */
const EYE = (() => {
  const v: [number, number, number] = [0, 0.6, 1];
  const n = Math.hypot(...v);
  return v.map((x) => x / n) as [number, number, number];
})();

/** How squarely a face has to point at your eyes to count as looked at. Front ≈ 0.86, top ≈ 0.51; a side face comes into view once the cube is turned ~30° toward it. */
export const VISIBLE_DOT = 0.4;
/** Total looking time before a side counts as seen — a face flashing past mid-rotation doesn't. */
export const MIN_LOOK_MS = 300;
/** Longest gap between samples still treated as continuous (a dropped packet shouldn't credit or erase seconds). */
const MAX_DT_MS = 250;

/** Kociemba facelet indices for each edge slot, in engine EDGE order (UR UF UL UB DR DF DL DB FR FL BL BR). */
export const EDGE_SLOT_FACELETS: readonly (readonly [number, number])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
export const EDGE_SLOT_NAMES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"] as const;

export interface GazeSegment {
  /** Ms from the start of inspection. */
  fromMs: number;
  toMs: number;
  /** Body faces pointing at the viewer's front and top. */
  front: Face;
  top: Face;
}

export interface GazeCrossEdge {
  /** e.g. "white-red". */
  name: string;
  /** The slot it sat in at the start of the solve, and that slot's two faces. */
  slot: number;
  faces: [Face, Face];
  facelets: [number, number];
  seen: boolean;
  /** Already solved in place — nothing to find. */
  solved: boolean;
}

export interface GazeReport {
  durationMs: number;
  /** Time each body face spent in view. */
  faceMs: Record<Face, number>;
  seen: Face[];
  unseen: Face[];
  timeline: GazeSegment[];
  crossEdges: GazeCrossEdge[];
  /** Cross edges (not already solved) on no side you looked at. */
  hidden: GazeCrossEdge[];
  headline: string;
}

export const faceColorName = (f: Face) => FACE_COLOR_NAMES[f];

/** Which body faces point at the eye in orientation `m`, and how squarely. */
export function faceVisibility(m: readonly number[]): Record<Face, number> {
  const out = {} as Record<Face, number>;
  for (const f of FACES) {
    const n = apply(m, FACE_NORMALS[f]);
    out[f] = n[0] * EYE[0] + n[1] * EYE[1] + n[2] * EYE[2];
  }
  return out;
}

/** Where the four white cross edges sit in a body-frame facelet state. */
export function crossEdgeLocations(facelets: string): Omit<GazeCrossEdge, "seen">[] {
  const cube = Cube.fromString(facelets);
  const out: Omit<GazeCrossEdge, "seen">[] = [];
  for (let piece = 0; piece < 4; piece++) {
    const slot = cube.ep.indexOf(piece);
    const name = EDGE_SLOT_NAMES[slot];
    out.push({
      name: `white-${FACE_COLOR_NAMES[EDGE_SLOT_NAMES[piece][1]]}`,
      slot,
      faces: [name[0] as Face, name[1] as Face],
      facelets: [...EDGE_SLOT_FACELETS[slot]] as [number, number],
      solved: slot === piece && cube.eo[slot] === 0,
    });
  }
  return out;
}

/**
 * The gaze report for one inspection: samples from `fromMs` (inspection
 * start) to `toMs` (first turn), against the scrambled state the cube was
 * in. Null when the gyro gave too little to go on.
 */
export function analyzeGaze(
  samples: readonly GyroSample[],
  ref: Quat,
  calibration: GyroCalibration,
  fromMs: number,
  toMs: number,
  startFacelets: string,
): GazeReport | null {
  const window = samples.filter((s) => s.atMs >= fromMs - MAX_DT_MS && s.atMs <= toMs);
  if (window.length < 3 || toMs - fromMs < 300) return null;

  const faceMs = Object.fromEntries(FACES.map((f) => [f, 0])) as Record<Face, number>;
  const timeline: GazeSegment[] = [];
  for (let i = 0; i < window.length; i++) {
    const start = Math.max(window[i].atMs, fromMs);
    const end = Math.min(i + 1 < window.length ? window[i + 1].atMs : toMs, toMs, start + MAX_DT_MS);
    const dt = end - start;
    if (dt <= 0) continue;
    const m = orientationFromQuat(window[i].q, ref, calibration);
    const vis = faceVisibility(m);
    for (const f of FACES) if (vis[f] >= VISIBLE_DOT) faceMs[f] += dt;
    const front = physicalFaceAt(m, "F") as Face;
    const top = physicalFaceAt(m, "U") as Face;
    const last = timeline[timeline.length - 1];
    if (last && last.front === front && last.top === top && Math.abs(last.toMs - (start - fromMs)) < MAX_DT_MS) last.toMs = end - fromMs;
    else timeline.push({ fromMs: start - fromMs, toMs: end - fromMs, front, top });
  }

  const seen = FACES.filter((f) => faceMs[f] >= MIN_LOOK_MS);
  const unseen = FACES.filter((f) => faceMs[f] < MIN_LOOK_MS);
  const crossEdges = crossEdgeLocations(startFacelets).map((e) => ({ ...e, seen: e.faces.some((f) => seen.includes(f)) }));
  const hidden = crossEdges.filter((e) => !e.seen && !e.solved);

  let headline: string;
  if (hidden.length === 0) headline = `You saw all ${crossEdges.filter((e) => !e.solved).length === 4 ? "four" : "the unsolved"} cross edges during inspection.`;
  else {
    const sides = [...new Set(hidden.flatMap((e) => e.faces).filter((f) => unseen.includes(f)))];
    const where = sides.length ? `the ${sides.map(faceColorName).join(" or ")} side` : "those sides";
    headline =
      hidden.length === 1
        ? `You never looked at ${where} — the ${hidden[0].name} edge was hiding there.`
        : `${hidden.length} cross edges were on sides you never looked at (${where}).`;
  }

  return { durationMs: toMs - fromMs, faceMs, seen, unseen, timeline, crossEdges, hidden, headline };
}
