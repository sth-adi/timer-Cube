import { STICKERS, moveGeometry, type MoveSpec, type Vec3 } from "@/lib/cube-engine/stickerTurns";

/**
 * Pure maths behind the 3D renderer (no three.js import, so it is cheap to test and never lands in a bundle).
 *
 * The facelet geometry in stickerTurns uses CSS 3D axes (x right, y DOWN, z toward the viewer). Three.js is
 * y-up right-handed, and so are the gyro quaternions, so a CSS point (x, y, z) is drawn at (x, -y, z); a turn
 * about CSS x or z then runs the opposite way round in three.js (the y flip), a turn about y the same way.
 */

export interface CubieSticker {
  /** facelet index 0..53 */
  index: number;
  /** outward normal in three.js axes */
  normal: Vec3;
}

export interface CubieLayout {
  key: string;
  /** rest position in three.js axes, one unit per cubie */
  pos: Vec3;
  /** the same cubie's coordinates in stickerTurns' CSS axes (what moveGeometry's layers are measured in) */
  css: Vec3;
  stickers: CubieSticker[];
}

const toThree = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : v[0], v[1] === 0 ? 0 : -v[1], v[2] === 0 ? 0 : v[2]];

/** The 26 outer cubies and the facelets they carry. */
export const CUBIE_LAYOUT: readonly CubieLayout[] = (() => {
  const map = new Map<string, CubieLayout>();
  STICKERS.forEach((s, index) => {
    const key = s.cubie.join(",");
    const c = map.get(key) ?? { key, pos: toThree(s.cubie), css: s.cubie, stickers: [] };
    c.stickers.push({ index, normal: toThree(s.normal) });
    map.set(key, c);
  });
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const key = [x, y, z].join(",");
        if (!map.has(key) && !(x === 0 && y === 0 && z === 0)) map.set(key, { key, pos: toThree([x, y, z]), css: [x, y, z], stickers: [] });
      }
  return [...map.values()];
})();

/**
 * The turn ease: smootherstep (slow in, no jerk at either end) plus a small settle at the end, so a layer glides up to the
 * quarter turn, goes about 2% past it and eases back, the way a real layer seats on its detent. It ends at exactly 1 with zero
 * speed, and passes 0.5 at the half.
 */
export const SETTLE = 0.03;
export function easeTurn(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const s = c * c * c * (c * (c * 6 - 15) + 10);
  const x = Math.max(0, Math.min(1, (c - 0.8) / 0.2));
  const sx = Math.sin(Math.PI * x);
  return s + SETTLE * sx * sx;
}

/** Slope of easeTurn (d eased / d t), used to estimate how fast a turn is moving. */
export function easeTurnSlope(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const s = 30 * c * c * (1 - c) * (1 - c);
  const x = (c - 0.8) / 0.2;
  const bump = x > 0 && x < 1 ? (SETTLE * Math.PI * Math.sin(2 * Math.PI * x)) / 0.2 : 0;
  return s + bump;
}

/** One turning group of cubies: angle (radians, three.js sense) about three.js axis `axis` (0 x, 1 y, 2 z). */
export interface LayerAngle {
  axis: 0 | 1 | 2;
  angle: number;
  /** angular speed as a fraction of the part's whole turn per unit progress (eased slope), signed like `angle` */
  slope: number;
}

/** Per cubie (same order as CUBIE_LAYOUT): the turn it is in, or null when it stays put. */
export function cubieTurns(turn: MoveSpec | null, progress: number): (LayerAngle | null)[] {
  if (!turn) return CUBIE_LAYOUT.map(() => null);
  const geo = moveGeometry(turn);
  const p = Math.max(0, Math.min(1, progress));
  const flip = geo.axis === 1 ? 1 : -1;
  return CUBIE_LAYOUT.map((c) => {
    const part = geo.parts.find((pt) => (pt.layers as readonly number[]).includes(c.css[geo.axis]));
    if (!part) return null;
    // a part that set off late covers its turn in what is left of the move, so both end together
    const own = part.lag > 0 ? Math.max(0, (p - part.lag) / (1 - part.lag)) : p;
    const k = (flip * part.degrees * Math.PI) / 180;
    const slope = part.lag > 0 ? (p > part.lag ? easeTurnSlope(own) / (1 - part.lag) : 0) : easeTurnSlope(own);
    return { axis: geo.axis, angle: k * easeTurn(own), slope: k * slope };
  });
}

/** Rotate a three.js point about a principal axis by `angle` radians (right-handed). */
export function rotateAbout(axis: 0 | 1 | 2, angle: number, v: Vec3): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

/** Pastel-bright lift of a "#rrggbb" sticker colour: a touch toward white plus a little gain, so ACES tone mapping keeps the reference's bright, matte look. */
export function liftColor(hex: string, amount = 0.04, gain = 1.03): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(1, ((v / 255) * (1 - amount) + amount) * gain));
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
}

/**
 * A `stickerFills` entry (the CSS colour TurnCube paints a sticker with: "rgb(r,g,b)" or "#rrggbb") as "#rrggbb", or null when it is
 * not one of those. The 3D cube lights and tone-maps it like any sticker colour, so a dimmed fill keeps its relation to the others.
 */
export function fillToHex(css: string | undefined): string | null {
  if (!css) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (hex) return `#${hex[1].toLowerCase()}`;
  const m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(css.trim());
  if (!m) return null;
  const ch = (v: string) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, "0");
  return `#${ch(m[1])}${ch(m[2])}${ch(m[3])}`;
}

/** Deterministic hash of a sticker index to -1..1, so each sticker has its own steady tone nudge. */
export function stickerJitter(index: number): number {
  let h = Math.imul(index + 1, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 2001) / 1000 - 1;
}

/** A lifted colour with that sticker's tone variation (`strength` is the largest fractional brightness change). */
export function toneColor(hex: string, index: number, strength = 0.035): [number, number, number] {
  const k = 1 + stickerJitter(index) * strength;
  const [r, g, b] = liftColor(hex);
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

/**
 * Motion blur as trailing ghost transforms: angles (radians) behind `angle` to draw the moving layer at, newest
 * first. `speed` is the layer's angular speed in radians per frame; below `minSpeed` there is no trail. The trail
 * is as long as the layer travels in about `reach` frames, capped at `maxSweep` radians, split into `count` ghosts.
 */
export function blurTrail(angle: number, speed: number, count = 3, opts?: { minSpeed?: number; reach?: number; maxSweep?: number }): number[] {
  const { minSpeed = 0.05, reach = 1.6, maxSweep = 0.34 } = opts ?? {};
  const v = Math.abs(speed);
  if (count <= 0 || v < minSpeed) return [];
  const sweep = Math.min(maxSweep, v * reach) * Math.sign(speed || 1);
  return Array.from({ length: count }, (_, i) => angle - (sweep * (i + 1)) / count);
}

/** Opacity of ghost `i` of `count`: the newest is the strongest, all faint; scaled by how far over the speed threshold the layer is. */
export function ghostOpacity(i: number, count: number, speed: number, minSpeed = 0.05): number {
  const over = Math.max(0, Math.min(1, (Math.abs(speed) - minSpeed) / 0.2));
  return 0.1 * over * (1 - i / (count + 0.5));
}

/** Fraction of a turn's estimated speed used when the real frame-to-frame speed is unknown (first frame, headless render): about a 160 ms turn at 60 fps. */
export const ASSUMED_TURN_FRAMES = 20;
