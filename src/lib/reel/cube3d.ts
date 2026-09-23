import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { FACE_NORMALS, apply, axisRotation, mul, type Mat3 } from "@/lib/gyro/orientation";

/**
 * A tiny 3D cube renderer for a 2D canvas: 54 stickers placed in 3D from a
 * Kociemba facelet string, a grip + camera rotation, orthographic
 * projection, painter's-algorithm depth sort — and one layer optionally
 * mid-turn, so a replay shows real turning layers instead of states
 * snapping from one to the next. No WebGL, so it also records cleanly to
 * video through canvas.captureStream().
 */

type Vec3 = [number, number, number];

export interface Sticker3d {
  /** Cubie coordinates (-1, 0 or 1 on each axis). */
  cubie: Vec3;
  normal: Vec3;
  color: string;
}

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;

/**
 * Cubie position of the sticker at (row, col) on each face, in the body
 * frame (x = R, y = U, z = F), following each face's standard facelet
 * reading order (U from the back row, D from the front row, R/L/B read as
 * seen from outside that face).
 */
function cubieFor(face: (typeof FACE_ORDER)[number], r: number, c: number): Vec3 {
  switch (face) {
    case "U":
      return [c - 1, 1, r - 1];
    case "R":
      return [1, 1 - r, 1 - c];
    case "F":
      return [c - 1, 1 - r, 1];
    case "D":
      return [c - 1, -1, 1 - r];
    case "L":
      return [-1, 1 - r, c - 1];
    case "B":
      return [1 - c, 1 - r, -1];
  }
}

export function stickers3d(facelets: string): Sticker3d[] {
  const out: Sticker3d[] = [];
  FACE_ORDER.forEach((face, f) => {
    for (let i = 0; i < 9; i++) {
      out.push({
        cubie: cubieFor(face, Math.floor(i / 3), i % 3),
        normal: FACE_NORMALS[face],
        color: FACELET_COLORS[facelets[f * 9 + i]] ?? "#555",
      });
    }
  });
  return out;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The rotation (body frame) a face turn applies at `progress` 0..1 of the way through. */
export function layerRotation(token: string, progress: number): { axis: Vec3; m: Mat3 } {
  const face = token[0];
  const axis = FACE_NORMALS[face];
  const quarter = token.endsWith("2") ? 2 : token.endsWith("'") ? -1 : 1;
  // Clockwise looking at the face = negative rotation about its outward normal.
  const deg = -90 * quarter * progress;
  const axisName = axis[0] !== 0 ? "x" : axis[1] !== 0 ? "y" : "z";
  const sign = axis[0] + axis[1] + axis[2];
  return { axis, m: axisRotation(axisName, deg * sign) };
}

export interface RenderOptions {
  /** Canvas-space center and size (half-width of the cube in px). */
  cx: number;
  cy: number;
  size: number;
  /** body → viewer grip, then a camera tilt so three faces show. */
  view: Mat3;
  /** A layer mid-turn. */
  turning?: { token: string; progress: number };
}

/** Standard three-quarter camera: a little from above and from the right. */
export const CAMERA: Mat3 = mul(axisRotation("x", 26), axisRotation("y", -34));

interface Quad {
  pts: [number, number][];
  depth: number;
  fill: string;
}

function quad(center: Vec3, t1: Vec3, t2: Vec3, half: number, rot: Mat3, view: Mat3, o: RenderOptions, fill: string): Quad | null {
  const corners: Vec3[] = [
    [center[0] - t1[0] * half - t2[0] * half, center[1] - t1[1] * half - t2[1] * half, center[2] - t1[2] * half - t2[2] * half],
    [center[0] + t1[0] * half - t2[0] * half, center[1] + t1[1] * half - t2[1] * half, center[2] + t1[2] * half - t2[2] * half],
    [center[0] + t1[0] * half + t2[0] * half, center[1] + t1[1] * half + t2[1] * half, center[2] + t1[2] * half + t2[2] * half],
    [center[0] - t1[0] * half + t2[0] * half, center[1] - t1[1] * half + t2[1] * half, center[2] - t1[2] * half + t2[2] * half],
  ];
  const m = mul(view, rot);
  const scale = o.size / 1.5;
  const projected = corners.map((p) => apply(m, p));
  const depth = projected.reduce((s, p) => s + p[2], 0) / 4;
  return { pts: projected.map((p) => [o.cx + p[0] * scale, o.cy - p[1] * scale]), depth, fill };
}

function tangents(normal: Vec3): [Vec3, Vec3] {
  if (normal[0] !== 0) return [[0, 1, 0], [0, 0, 1]];
  if (normal[1] !== 0) return [[1, 0, 0], [0, 0, 1]];
  return [[1, 0, 0], [0, 1, 0]];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Draws the cube for a facelet state (optionally with one layer part-way through a turn). */
export function drawCube(ctx: CanvasRenderingContext2D, facelets: string, o: RenderOptions): void {
  const quads: Quad[] = [];
  const turn = o.turning ? layerRotation(o.turning.token, o.turning.progress) : null;
  const inLayer = (cubie: Vec3) => !!turn && dot(cubie, turn.axis) > 0.5;

  for (const s of stickers3d(facelets)) {
    const rot = inLayer(s.cubie) ? turn!.m : IDENTITY;
    const worldNormal = apply(mul(o.view, rot), s.normal);
    if (worldNormal[2] <= 0.001) continue; // facing away
    const center: Vec3 = [
      s.cubie[0] + s.normal[0] * 0.5,
      s.cubie[1] + s.normal[1] * 0.5,
      s.cubie[2] + s.normal[2] * 0.5,
    ];
    const [t1, t2] = tangents(s.normal);
    const body = quad(center, t1, t2, 0.5, rot, o.view, o, "#0b0b0d");
    const sticker = quad(center, t1, t2, 0.42, rot, o.view, o, s.color);
    if (body && sticker) {
      sticker.depth += 1e-3;
      quads.push(body, sticker);
    }
  }

  // While a layer is turning, the cut between it and the rest of the cube is
  // exposed: fill both faces of the cut with plastic so it doesn't look hollow.
  if (turn && o.turning!.progress > 0 && o.turning!.progress < 1) {
    const a = turn.axis;
    const [t1, t2] = tangents(a);
    const cut: Vec3 = [a[0] * 0.5, a[1] * 0.5, a[2] * 0.5];
    for (const rot of [IDENTITY, turn.m]) {
      const q = quad(cut, t1, t2, 1.5, rot, o.view, o, "#0b0b0d");
      if (q) quads.push({ ...q, depth: q.depth - 0.01 });
    }
  }

  quads.sort((p, q) => p.depth - q.depth);
  for (const q of quads) {
    ctx.beginPath();
    ctx.moveTo(q.pts[0][0], q.pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i][0], q.pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = q.fill;
    ctx.fill();
  }
}
