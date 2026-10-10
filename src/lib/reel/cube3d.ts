import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { FACE_NORMALS, axisRotation, mul, type Mat3 } from "@/lib/gyro/orientation";

/**
 * A small 3D cube renderer for a 2D canvas, in the same recipe as the Gyro
 * Twin: 26 black-bodied, rounded cubies with inset rounded stickers, each
 * face shaded by how it faces the light, a faint bevel and a soft specular
 * on every sticker. One layer can be mid-turn, so a replay shows real
 * turning layers. No WebGL, so it records cleanly through
 * canvas.captureStream().
 *
 * Projection is orthographic, so a cubie face is an affine image of a unit
 * square: every face is drawn by setting one transform and filling shared,
 * prebuilt rounded-rectangle paths — the per-frame cost is constant
 * (26 cubies x 6 sides, culled by facing, painter-sorted) and nothing is
 * allocated per frame.
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
  view: ArrayLike<number>;
  /** A layer mid-turn (progress 0..1, already eased by the caller). */
  turning?: { token: string; progress: number };
}

/** Standard three-quarter camera: a little from above and from the right. */
export const CAMERA: Mat3 = mul(axisRotation("x", 26), axisRotation("y", -34));

// ───────────────────────── shared geometry (built once) ─────────────────────────

/** Full-size cubie face, rounded; and the inset sticker on it (unit square centred on 0). */
const BODY_HALF = 0.5;
const BODY_RADIUS = 0.1;
const STICKER_HALF = 0.5 - 0.085;
const STICKER_RADIUS = 0.1;

const LEVELS = 24;
const K_MIN = 0.58;
const K_MAX = 1.18;
/** Direction the light comes from, in the viewer's frame (x right, y up, z toward the viewer): up, left, a little front. */
const LIGHT: Vec3 = (() => {
  const v: Vec3 = [-0.42, 0.78, 0.62];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();
/** Half-vector between the light and the viewer (0,0,1): where a glossy sticker catches a highlight. */
const HALF: Vec3 = (() => {
  const v: Vec3 = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

const BODY_RGB: [number, number, number] = [19, 19, 25];
/** Facelet char → colour slot (0..5 = U R F D L B, 6 = unknown). */
const COLOR_SLOT = new Uint8Array(128).fill(6);
const SLOT_RGB: [number, number, number][] = [];
(["U", "R", "F", "D", "L", "B"] as const).forEach((f, i) => {
  COLOR_SLOT[f.charCodeAt(0)] = i;
  const n = parseInt(FACELET_COLORS[f].slice(1), 16);
  SLOT_RGB.push([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
});
SLOT_RGB.push([85, 85, 85]);

const rgbAt = (base: [number, number, number], k: number) =>
  `rgb(${Math.min(255, Math.round(base[0] * k))},${Math.min(255, Math.round(base[1] * k))},${Math.min(255, Math.round(base[2] * k))})`;
const levelK = (lv: number) => K_MIN + ((K_MAX - K_MIN) * lv) / (LEVELS - 1);

/** Every colour at every brightness level, as ready-made strings — shading a face is a table lookup, not a string build. */
const STICKER_FILL: string[][] = SLOT_RGB.map((rgb) => Array.from({ length: LEVELS }, (_, lv) => rgbAt(rgb, levelK(lv))));
const BODY_FILL: string[] = Array.from({ length: LEVELS }, (_, lv) => rgbAt(BODY_RGB, levelK(lv) * 1.05));
/** Thin lit edge around each body, brighter on faces that face the light. */
const RIM_STROKE: string[] = Array.from({ length: LEVELS }, (_, lv) => `rgba(255,255,255,${(0.025 + 0.085 * (lv / (LEVELS - 1))).toFixed(3)})`);

const FACE_COUNT = 26 * 6;
/** Per cubie side: cubie position, which body axis the outward normal runs along, its sign, and the facelet drawn there (or -1). */
const F_CUBIE = new Int8Array(FACE_COUNT * 3);
const F_AXIS = new Uint8Array(FACE_COUNT);
const F_SIGN = new Int8Array(FACE_COUNT);
const F_STICKER = new Int16Array(FACE_COUNT).fill(-1);
/** Facelet index → which side of which cubie, so a facelet string maps straight onto the face table. */
(() => {
  const faceId = new Map<string, number>();
  let n = 0;
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        for (let axis = 0; axis < 3; axis++)
          for (const sign of [1, -1]) {
            F_CUBIE[n * 3] = x;
            F_CUBIE[n * 3 + 1] = y;
            F_CUBIE[n * 3 + 2] = z;
            F_AXIS[n] = axis;
            F_SIGN[n] = sign;
            faceId.set(`${x},${y},${z},${axis},${sign}`, n);
            n++;
          }
      }
  FACE_ORDER.forEach((face, f) => {
    const nrm = FACE_NORMALS[face];
    const axis = nrm[0] !== 0 ? 0 : nrm[1] !== 0 ? 1 : 2;
    const sign = nrm[axis];
    for (let i = 0; i < 9; i++) {
      const c = cubieFor(face, Math.floor(i / 3), i % 3);
      F_STICKER[faceId.get(`${c[0]},${c[1]},${c[2]},${axis},${sign}`)!] = f * 9 + i;
    }
  });
})();

/** Per-canvas-context drawing assets: paths and gradients are built once and reused every frame. */
interface Assets {
  body: Path2D;
  sticker: Path2D;
  plate: Path2D;
  /** Bevel (lit corner → opposite corner) and specular gradients, one per lit corner (TL, TR, BL, BR). */
  bevel: CanvasGradient[];
  spec: CanvasGradient[];
  shadow: CanvasGradient;
}

function roundedRect(half: number, r: number): Path2D {
  const p = new Path2D();
  p.moveTo(-half + r, -half);
  p.arcTo(half, -half, half, half, r);
  p.arcTo(half, half, -half, half, r);
  p.arcTo(-half, half, -half, -half, r);
  p.arcTo(-half, -half, half, -half, r);
  p.closePath();
  return p;
}

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

const assetCache = new WeakMap<object, Assets>();
function assetsFor(ctx: CanvasRenderingContext2D): Assets {
  let a = assetCache.get(ctx);
  if (a) return a;
  const h = STICKER_HALF;
  const bevel = CORNERS.map(([cu, cv]) => {
    const g = ctx.createLinearGradient(cu * h, cv * h, -cu * h, -cv * h);
    g.addColorStop(0, "rgba(255,255,255,0.20)");
    g.addColorStop(0.45, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,0.20)");
    return g;
  });
  const spec = CORNERS.map(([cu, cv]) => {
    const g = ctx.createRadialGradient(cu * 0.2, cv * 0.2, 0, cu * 0.2, cv * 0.2, 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    return g;
  });
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(0, "rgba(0,0,0,0.38)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  a = { body: roundedRect(BODY_HALF, BODY_RADIUS), sticker: roundedRect(STICKER_HALF, STICKER_RADIUS), plate: roundedRect(1, 0.04), bevel, spec, shadow };
  assetCache.set(ctx, a);
  return a;
}

/**
 * The soft ground shadow under a floating cube: a radial falloff squashed
 * to ~12% height. `y` is the canvas y of the shadow's centre (canvas space, not affected by any translate), `rx` its
 * half-width; `strength` 0..1 scales the whole thing (to fade it in).
 */
export function drawGroundShadow(ctx: CanvasRenderingContext2D, cx: number, y: number, rx: number, strength = 1): void {
  const a = assetsFor(ctx);
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.setTransform(rx, 0, 0, rx * 0.12, cx, y);
  ctx.fillStyle = a.shadow;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// ───────────────────────── per-frame scratch (never reallocated) ─────────────────────────

const MAX_ITEMS = FACE_COUNT + 4;
const V = new Float64Array(9);
const T = new Float64Array(9);
const R = new Float64Array(9);
const itemId = new Int16Array(MAX_ITEMS);
const itemDepth = new Float64Array(MAX_ITEMS);
const itemLevel = new Uint8Array(MAX_ITEMS);
/** Item ids at or above FACE_COUNT are the cut plates exposed while a layer turns. */
const PLATE_BASE = FACE_COUNT;

/** The rotation of `token` at `progress`, written into `out` (same maths as layerRotation, no allocation). */
function layerMatrixInto(out: Float64Array, token: string, progress: number): void {
  const face = token[0];
  const n = FACE_NORMALS[face];
  const quarter = token.endsWith("2") ? 2 : token.endsWith("'") ? -1 : 1;
  const sign = n[0] + n[1] + n[2];
  const t = (-90 * quarter * progress * sign * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  out.fill(0);
  if (n[0] !== 0) {
    out[0] = 1;
    out[4] = c;
    out[5] = -s;
    out[7] = s;
    out[8] = c;
  } else if (n[1] !== 0) {
    out[4] = 1;
    out[0] = c;
    out[2] = s;
    out[6] = -s;
    out[8] = c;
  } else {
    out[8] = 1;
    out[0] = c;
    out[1] = -s;
    out[3] = s;
    out[4] = c;
  }
}

/** out = a · b for 3x3 row-major. `out` must not alias a or b. */
function mulInto(out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Draws the cube for a facelet state (optionally with one layer part-way through a turn). Leaves the context's transform reset. */
export function drawCube(ctx: CanvasRenderingContext2D, facelets: string, o: RenderOptions): void {
  const a = assetsFor(ctx);
  const baseAlpha = ctx.globalAlpha;
  // The cube sets its own absolute transforms, so give back whatever transform the caller had (the frame's content offset).
  const base = ctx.getTransform();
  const scale = o.size / 1.5;
  for (let i = 0; i < 9; i++) V[i] = o.view[i];

  // The turning layer: body-frame axis index + sign, and the composed matrix for its cubies.
  let turnAxis = -1;
  let turnSign = 0;
  let cutting = false;
  if (o.turning && o.turning.progress > 0) {
    const n = FACE_NORMALS[o.turning.token[0]];
    turnAxis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
    turnSign = n[turnAxis];
    layerMatrixInto(R, o.turning.token, o.turning.progress);
    mulInto(T, V, R);
    cutting = o.turning.progress < 1;
  }
  // progress 1 is the finished turn: the caller's next state already has it applied, so draw nothing special.
  const turningNow = turnAxis >= 0 && cutting;

  // 1. Collect visible faces: world normal toward the viewer, depth = world z of the face centre.
  let n = 0;
  if (turningNow) {
    // The cut between the turning layer and the rest is exposed: a dark plate on each side of it, drawn first (behind everything).
    for (let k = 0; k < 2; k++) {
      itemId[n] = PLATE_BASE + k;
      itemDepth[n] = -100;
      itemLevel[n] = 0;
      n++;
    }
  }
  for (let f = 0; f < FACE_COUNT; f++) {
    const axis = F_AXIS[f];
    const sign = F_SIGN[f];
    const cx0 = F_CUBIE[f * 3];
    const cy0 = F_CUBIE[f * 3 + 1];
    const cz0 = F_CUBIE[f * 3 + 2];
    const moving = turningNow && F_CUBIE[f * 3 + turnAxis] * turnSign > 0.5;
    const M = moving ? T : V;
    const nx = M[axis] * sign;
    const ny = M[3 + axis] * sign;
    const nz = M[6 + axis] * sign;
    if (nz <= 0.001) continue; // facing away
    const depth = M[6] * (cx0 + (axis === 0 ? sign * 0.5 : 0)) + M[7] * (cy0 + (axis === 1 ? sign * 0.5 : 0)) + M[8] * (cz0 + (axis === 2 ? sign * 0.5 : 0));
    // Lambert from the light + a trace of ambient depth: nearer faces a touch brighter.
    const lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    const k = 0.7 + 0.46 * (lam > 0 ? lam : 0) + 0.025 * depth;
    const lv = Math.round(clamp01((k - K_MIN) / (K_MAX - K_MIN)) * (LEVELS - 1));
    itemId[n] = f;
    itemDepth[n] = depth;
    itemLevel[n] = lv;
    n++;
  }

  // 2. Painter's sort (insertion sort: ~30-80 items, already nearly ordered frame to frame, no allocation).
  for (let i = 1; i < n; i++) {
    const id = itemId[i];
    const d = itemDepth[i];
    const lv = itemLevel[i];
    let j = i - 1;
    while (j >= 0 && itemDepth[j] > d) {
      itemId[j + 1] = itemId[j];
      itemDepth[j + 1] = itemDepth[j];
      itemLevel[j + 1] = itemLevel[j];
      j--;
    }
    itemId[j + 1] = id;
    itemDepth[j + 1] = d;
    itemLevel[j + 1] = lv;
  }

  // 3. Draw.
  for (let i = 0; i < n; i++) {
    const id = itemId[i];
    if (id >= PLATE_BASE) {
      // Plate k=0: the still side of the cut; k=1: the turning side.
      const M = id === PLATE_BASE ? V : T;
      const pos = turnSign * 0.5;
      const ax = turnAxis;
      const e = o.cx + scale * M[ax] * pos;
      const f = o.cy - scale * M[3 + ax] * pos;
      const b = (ax + 1) % 3;
      const c = (ax + 2) % 3;
      const s = 1.42;
      ctx.setTransform(scale * M[b] * s, -scale * M[3 + b] * s, scale * M[c] * s, -scale * M[3 + c] * s, e, f);
      ctx.fillStyle = BODY_FILL[3];
      ctx.fill(a.plate);
      continue;
    }
    const axis = F_AXIS[id];
    const sign = F_SIGN[id];
    const moving = turningNow && F_CUBIE[id * 3 + turnAxis] * turnSign > 0.5;
    const M = moving ? T : V;
    const cx0 = F_CUBIE[id * 3] + (axis === 0 ? sign * 0.5 : 0);
    const cy0 = F_CUBIE[id * 3 + 1] + (axis === 1 ? sign * 0.5 : 0);
    const cz0 = F_CUBIE[id * 3 + 2] + (axis === 2 ? sign * 0.5 : 0);
    const ex = M[0] * cx0 + M[1] * cy0 + M[2] * cz0;
    const ey = M[3] * cx0 + M[4] * cy0 + M[5] * cz0;
    const b = (axis + 1) % 3;
    const c = (axis + 2) % 3;
    const ta = scale * M[b];
    const tb = -scale * M[3 + b];
    const tc = scale * M[c];
    const td = -scale * M[3 + c];
    ctx.setTransform(ta, tb, tc, td, o.cx + scale * ex, o.cy - scale * ey);
    const lv = itemLevel[i];
    ctx.fillStyle = BODY_FILL[lv];
    ctx.fill(a.body);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = RIM_STROKE[lv];
    ctx.stroke(a.body);

    const idx = F_STICKER[id];
    if (idx < 0) continue;
    const slot = COLOR_SLOT[facelets.charCodeAt(idx) & 127];
    ctx.fillStyle = STICKER_FILL[slot][lv];
    ctx.fill(a.sticker);
    // Bevel + specular, with the lit corner chosen so the light always comes from the upper left on screen
    // whatever way the face's own axes happen to run.
    let best = 0;
    let bestScore = -Infinity;
    for (let q = 0; q < 4; q++) {
      const gu = CORNERS[q][0];
      const gv = CORNERS[q][1];
      const score = -(gu * ta + gv * tc) - (gu * tb + gv * td);
      if (score > bestScore) {
        bestScore = score;
        best = q;
      }
    }
    ctx.globalAlpha = baseAlpha * 0.9;
    ctx.fillStyle = a.bevel[best];
    ctx.fill(a.sticker);
    // Specular: strongest where the face's normal sits near the half-vector.
    const sx = M[axis] * sign;
    const sy = M[3 + axis] * sign;
    const sz = M[6 + axis] * sign;
    const nh = sx * HALF[0] + sy * HALF[1] + sz * HALF[2];
    if (nh > 0.82) {
      const g = (nh - 0.82) / 0.18;
      ctx.globalAlpha = baseAlpha * 0.5 * g * g;
      ctx.fillStyle = a.spec[best];
      ctx.fill(a.sticker);
    }
    ctx.globalAlpha = baseAlpha;
  }
  ctx.setTransform(base);
}
