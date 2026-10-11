import type { BodyColor, StickerStyle } from "./look";
import { fillToHex } from "./layout";

/** Pure colour and material numbers behind the cube looks and the per-theme studio light (no three.js, so cheap to test). */

type Rgb = [number, number, number];

/** Which sticker geometry a style draws: a domed pillow, a nearly flush plate that fills the facelet, or a flat tile. */
export type PlateKind = "dome" | "plate" | "tile";

export interface StickerStyleSpec {
  plate: PlateKind;
  roughness: number;
  specular: number;
  /** body vertices take the colour of the sticker on their side (stickerless: solid-colour plastic cubies) */
  paintedBody: boolean;
}

export const STICKER_SPECS: Record<StickerStyle, StickerStyleSpec> = {
  bright: { plate: "dome", roughness: 0.55, specular: 0.3, paintedBody: false },
  pastel: { plate: "dome", roughness: 0.62, specular: 0.25, paintedBody: false },
  stickerless: { plate: "plate", roughness: 0.38, specular: 0.5, paintedBody: true },
  tiled: { plate: "tile", roughness: 0.5, specular: 0.3, paintedBody: false },
};

export interface BodySpec {
  /** "#rrggbb"; null keeps the renderer's own black plastic (CUBE_BODY, lifted) */
  hex: string | null;
  roughness: number;
  /** the dark core seen through the gaps between cubies */
  core: string;
  /** colour of the motion-blur ghosts of the body, linear-ish 0..1 */
  ghost: Rgb;
}

export const BODY_SPECS: Record<BodyColor, BodySpec> = {
  black: { hex: null, roughness: 0.3, core: "#050507", ghost: [0.04, 0.04, 0.05] },
  graphite: { hex: "#2b2d33", roughness: 0.34, core: "#0d0e11", ghost: [0.1, 0.105, 0.12] },
  white: { hex: "#e8e8ea", roughness: 0.4, core: "#8a8b90", ghost: [0.62, 0.62, 0.64] },
};

const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The pastel look of a 0..1 colour: less saturated and lighter, hue kept. */
export function pastelize(rgb: Rgb, desaturate = 0.3, lighten = 0.28): Rgb {
  const grey = luma(rgb);
  const soft = mix(rgb, [grey, grey, grey], desaturate);
  const out = mix(soft, [1, 1, 1], lighten);
  return [Math.min(1, out[0]), Math.min(1, out[1]), Math.min(1, out[2])];
}

/** A 0..1 colour dressed for a sticker style (only pastel changes the colour itself). */
export function styleColor(rgb: Rgb, style: StickerStyle): Rgb {
  return style === "pastel" ? pastelize(rgb) : rgb;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface StudioLight {
  key: Rgb;
  fill: Rgb;
  rim: Rgb;
}

const KEY_BASE: Rgb = [1, 0.965, 0.92];
const FILL_BASE: Rgb = [0.92, 0.95, 1];

/**
 * The studio light for a theme: the neutral warm key and cool fill nudged toward the theme's accent (a warm theme gets a
 * warmer key, slate a cooler one), and a rim light that carries more of it. Subtle on purpose: the stickers keep their colours.
 */
export function studioLight(accentCss: string | null | undefined, backgroundCss?: string | null): StudioLight {
  const hex = fillToHex(accentCss ?? undefined);
  const accent = hex ? hexToRgb(hex) : ([1, 1, 1] as Rgb);
  // lift the accent so a dark accent tints without dimming the light
  const bright = mix(accent, [1, 1, 1], 0.45);
  const bgHex = fillToHex(backgroundCss ?? undefined);
  const light = bgHex ? luma(hexToRgb(bgHex)) > 0.6 : false;
  const k = light ? 0.1 : 0.16;
  return { key: mix(KEY_BASE, bright, k), fill: mix(FILL_BASE, bright, k), rim: mix([1, 1, 1], bright, 0.55) };
}
