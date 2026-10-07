import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { mix, parseCssColor, shade, toHex, type RGB } from "./cardLayout";

/**
 * The beveled cube as a pure canvas helper: a small isometric 3x3 with a black
 * body, rounded stickers inset into it and a baked brightness per facing — the
 * same recipe as the Gyro Twin (components/lab/TurnCube.tsx), so the brand mark
 * on a share image matches the cube in the app. No DOM: takes any 2D context.
 */

export type Pt = { x: number; y: number };
export type CubeFace = "U" | "F" | "R";

export interface CubeQuad {
  face: CubeFace;
  /** 0-8, row-major as viewed head-on. */
  cell: number;
  /** Index into the 54-char facelet string (U0-8, R9-17, F18-26, ...). */
  facelet: number;
  /** Corners in drawing order (clockwise on screen). */
  quad: [Pt, Pt, Pt, Pt];
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Facelet-string offset of each visible face's first sticker. */
const FACE_OFFSET: Record<CubeFace, number> = { U: 0, R: 9, F: 18 };

/** Brightness per facing: light from above and the left, like the Gyro Twin's SHADE table. */
export const FACE_SHADE: Record<CubeFace, number> = { U: 1.08, F: 1, R: 0.86 };

/** Cube body colour (TurnCube's BODY). */
export const CUBE_BODY = "#0b0b0e";

/** Edge length of one cubie so the whole cube is `size` tall (an isometric cube is 6e tall and 6*cos30*e wide). */
export function cubieEdge(size: number): number {
  return size / 6;
}

/** Width of the drawn cube for a given height. */
export function cubeWidth(size: number): number {
  return 6 * COS30 * cubieEdge(size);
}

/**
 * Screen position of cube-space (x, y, z), each 0-3: x runs right-and-down
 * (toward the R face), y left-and-down (toward F), z up. (cx, cy) is the middle
 * of the cube's bounding box.
 */
function project(cx: number, cy: number, e: number, x: number, y: number, z: number): Pt {
  return { x: cx + (x - y) * COS30 * e, y: cy + (x + y) * SIN30 * e - z * e };
}

/** The 27 sticker quads of the three visible faces (U on top, F front-left, R front-right) of a cube whose bounding box is `size` tall, centred at (cx, cy). */
export function cubeQuads(cx: number, cy: number, size: number): CubeQuad[] {
  const e = cubieEdge(size);
  const p = (x: number, y: number, z: number) => project(cx, cy, e, x, y, z);
  const out: CubeQuad[] = [];
  for (let cell = 0; cell < 9; cell++) {
    const c = cell % 3;
    const r = Math.floor(cell / 3);
    // Top: columns run toward R (x), rows toward F (y).
    out.push({ face: "U", cell, facelet: FACE_OFFSET.U + cell, quad: [p(c, r, 3), p(c + 1, r, 3), p(c + 1, r + 1, 3), p(c, r + 1, 3)] });
    // Front-left: columns run toward R (x), rows go down (z).
    const z = 3 - r;
    out.push({ face: "F", cell, facelet: FACE_OFFSET.F + cell, quad: [p(c, 3, z), p(c + 1, 3, z), p(c + 1, 3, z - 1), p(c, 3, z - 1)] });
    // Front-right: columns run toward the back (y decreasing), rows go down.
    const y = 3 - c;
    out.push({ face: "R", cell, facelet: FACE_OFFSET.R + cell, quad: [p(3, y, z), p(3, y - 1, z), p(3, y - 1, z - 1), p(3, y, z - 1)] });
  }
  return out;
}

/** The six corners of the cube's outline, clockwise from the top. */
export function cubeSilhouette(cx: number, cy: number, size: number): Pt[] {
  const e = cubieEdge(size);
  const p = (x: number, y: number, z: number) => project(cx, cy, e, x, y, z);
  return [p(0, 0, 3), p(3, 0, 3), p(3, 0, 0), p(3, 3, 0), p(0, 3, 0), p(0, 3, 3)];
}

/** Moves each corner toward the centre of the quad by `t` (0 = unchanged, 1 = a point). */
export function insetQuad(q: readonly Pt[], t: number): Pt[] {
  const cx = q.reduce((a, p) => a + p.x, 0) / q.length;
  const cy = q.reduce((a, p) => a + p.y, 0) / q.length;
  return q.map((p) => ({ x: p.x + (cx - p.x) * t, y: p.y + (cy - p.y) * t }));
}

/** A closed polygon with rounded corners (radius clamped to half the shortest edge). */
export function roundedPolygon(ctx: CanvasRenderingContext2D, pts: readonly Pt[], radius: number): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const la = Math.hypot(a.x - b.x, a.y - b.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, la / 2, lc / 2);
    const p1 = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
    const p2 = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
    if (i === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    ctx.quadraticCurveTo(b.x, b.y, p2.x, p2.y);
  }
  ctx.closePath();
}

/** Sticker colour for a facelet letter, as channels. */
function stickerRgb(letter: string): RGB {
  return parseCssColor(FACELET_COLORS[letter] ?? "#555555")?.rgb ?? [85, 85, 85];
}

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export interface CardCubeOptions {
  /** 54-char facelet string; solved when omitted or malformed. */
  facelets?: string;
  /** Ground shadow under the cube (an ellipse squashed to ~12% height, ~8px below). Default true. */
  groundShadow?: boolean;
  /** Strength of the shadows, 0-1 (use less on a light card). Default 1. */
  shadowStrength?: number;
  /** A faint coloured glow behind the cube, e.g. the theme accent. */
  glow?: string | null;
  /** Canvas pixels per drawing unit (canvas shadows ignore the transform, so the caller says how much it scaled). Default 1. */
  pixelRatio?: number;
}

/**
 * Draws the cube centred at (cx, cy), `size` px tall. Bodies first (one rounded
 * hexagon with a soft drop shadow), then per sticker: a body tile with a faint
 * lit edge, the rounded inset sticker with its facing's brightness baked in, a
 * soft gloss along the top, and a darker rim.
 */
export function drawCardCube(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, opts: CardCubeOptions = {}): void {
  const facelets = opts.facelets && opts.facelets.length === 54 ? opts.facelets : SOLVED;
  const strength = opts.shadowStrength ?? 1;
  const pr = opts.pixelRatio ?? 1;
  const e = cubieEdge(size);
  const outline = cubeSilhouette(cx, cy, size);
  const bodyRgb = parseCssColor(CUBE_BODY)!.rgb;

  ctx.save();

  // Faint accent glow.
  if (opts.glow) {
    const g = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.95);
    g.addColorStop(0, opts.glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  }

  // Ground shadow: closest-side radial gradient squashed to 12% height, 8px (scaled) below the cube.
  if (opts.groundShadow !== false) {
    const bottom = outline[3].y;
    const rx = cubeWidth(size) * 0.62;
    ctx.save();
    ctx.translate(cx, bottom + size * 0.05 + 8 * (size / 120));
    ctx.scale(1, 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(0,0,0,${(0.38 * strength).toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body silhouette with drop-shadow (offset and blur in canvas pixels: scale by the caller's ratio).
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${(0.45 * strength).toFixed(3)})`;
  ctx.shadowBlur = size * 0.15 * pr;
  ctx.shadowOffsetY = size * 0.08 * pr;
  roundedPolygon(ctx, outline, e * 0.22);
  ctx.fillStyle = CUBE_BODY;
  ctx.fill();
  ctx.restore();

  const quads = cubeQuads(cx, cy, size);
  const innerFill = toHex(bodyRgb);

  for (const q of quads) {
    const k = FACE_SHADE[q.face];
    // Body tile: slightly lighter than the black so the seams between cubies read as bevels.
    roundedPolygon(ctx, insetQuad(q.quad, 0.015), e * 0.12);
    ctx.fillStyle = toHex(mix(bodyRgb, [60, 60, 70], 0.18 * k));
    ctx.fill();
    roundedPolygon(ctx, insetQuad(q.quad, 0.05), e * 0.12);
    ctx.fillStyle = innerFill;
    ctx.fill();

    // Sticker.
    const inset = insetQuad(q.quad, 0.1);
    const rgb = shade(stickerRgb(facelets[q.facelet]), k);
    roundedPolygon(ctx, inset, e * 0.17);
    ctx.fillStyle = toHex(rgb);
    ctx.fill();

    // Gloss: lighter at the edge nearest the light, fading across the sticker.
    ctx.save();
    roundedPolygon(ctx, inset, e * 0.17);
    ctx.clip();
    const a = inset[0];
    const c = inset[2];
    const gloss = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
    gloss.addColorStop(0, "rgba(255,255,255,0.20)");
    gloss.addColorStop(0.55, "rgba(255,255,255,0)");
    gloss.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = gloss;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = Math.max(0.6, e * 0.035);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    roundedPolygon(ctx, inset, e * 0.17);
    ctx.stroke();
  }

  // Lit rim along the top edges of the silhouette.
  ctx.beginPath();
  ctx.moveTo(outline[5].x, outline[5].y);
  ctx.lineTo(outline[0].x, outline[0].y);
  ctx.lineTo(outline[1].x, outline[1].y);
  ctx.lineWidth = Math.max(0.8, e * 0.05);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.stroke();

  ctx.restore();
}
