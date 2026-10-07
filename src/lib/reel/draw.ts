import { DEFAULT_MONO, DEFAULT_SANS, REEL_BG_BOTTOM, REEL_BG_TOP, withAlpha } from "./theme";

/**
 * Small drawing helpers shared by the Solve Reel frame and the Highlight
 * Reel cards, so every screen of a video agrees on size, type, easing and
 * background. Everything here reuses objects between frames: gradients are
 * built once per canvas, widths are measured once per string.
 */

/** Reel canvas size: 4:5 portrait, the shape social feeds display largest. */
export const REEL_W = 1080;
export const REEL_H = 1350;

/**
 * Safe areas. A 1:1 crop of the 4:5 canvas keeps the middle 1080x1080 (y 135..1215); a 9:16 story
 * letterboxes it and keeps everything. Anything that must be seen — type, the cube, the pacing
 * bar — sits inside SAFE_TOP..SAFE_BOTTOM and SAFE_X in from each side; only the faint watermark
 * lives outside, in the part a square crop is allowed to lose.
 */
export const SAFE_X = 72;
export const SAFE_TOP = 168;
export const SAFE_BOTTOM = 1208;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Overshoots a little before settling — for a number popping into place. */
export const easeOutBack = (x: number) => {
  const t = clamp01(x) - 1;
  return 1 + 2.2 * t * t * t + 1.2 * t * t;
};

/** Truncated to hundredths, like every other time in the app (a 10.709 is a 10.70, not a 10.71). */
export function fmtTime(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const s = cs / 100;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}` : s.toFixed(2);
}

/** A rounded-rectangle path with no allocation (arcTo, so it works wherever canvas does). */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Letter-spacing where the browser supports it (ignored elsewhere — the text just sits a little tighter). */
export function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as unknown as { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

const widths = new Map<string, number>();
/** Width of `text` in `font` (set on the context first), remembered — measuring is the slow part of laying out text. */
export function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}|${(ctx as unknown as { letterSpacing?: string }).letterSpacing ?? ""}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (widths.size > 600) widths.clear();
    w = ctx.measureText(text).width;
    widths.set(key, w);
  }
  return w;
}

export interface Fonts {
  hero: string;
  chip: string;
  tick: string;
  tickCurrent: string;
  label: string;
  split: string;
  small: string;
  scramble: string;
  header: string;
  headerSub: string;
  credit: string;
  display: string;
  caption: string;
  body: string;
}

const fontCache = new Map<string, Fonts>();
/** One set of font strings per (sans, mono) pair — consistent type everywhere, built once. */
export function fontsFor(sans = DEFAULT_SANS, mono = DEFAULT_MONO): Fonts {
  const key = `${sans}|${mono}`;
  let f = fontCache.get(key);
  if (!f) {
    f = {
      hero: `700 176px ${mono}`,
      chip: `600 34px ${sans}`,
      tick: `600 38px ${mono}`,
      tickCurrent: `700 50px ${mono}`,
      label: `700 22px ${sans}`,
      split: `600 30px ${mono}`,
      small: `500 24px ${sans}`,
      scramble: `500 25px ${mono}`,
      header: `700 26px ${sans}`,
      headerSub: `500 26px ${sans}`,
      credit: `500 22px ${sans}`,
      display: `800 92px ${sans}`,
      caption: `600 30px ${sans}`,
      body: `500 34px ${sans}`,
    };
    fontCache.set(key, f);
  }
  return f;
}

/** The four phase hues (Cross, F2L, OLL, PLL) — the same four the analytics charts use on a dark surface. */
export const PHASE_HUES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const;

interface Backdrop {
  accent: string;
  bg: CanvasGradient;
  glow: CanvasGradient;
  vignette: CanvasGradient;
}
const backdrops = new WeakMap<object, Backdrop>();

/**
 * The card background: a deep gradient, a soft accent glow behind the
 * cube (`glowY`, canvas y of its centre) and a vignette. `pulse` 0..1
 * breathes the glow.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, accent: string, glowY: number, pulse = 0): void {
  let b = backdrops.get(ctx);
  if (!b || b.accent !== accent) {
    const bg = ctx.createLinearGradient(0, 0, 0, REEL_H);
    bg.addColorStop(0, REEL_BG_TOP);
    bg.addColorStop(1, REEL_BG_BOTTOM);
    const glow = ctx.createRadialGradient(REEL_W / 2, 0, 0, REEL_W / 2, 0, 560);
    glow.addColorStop(0, withAlpha(accent, 0.3));
    glow.addColorStop(0.55, withAlpha(accent, 0.09));
    glow.addColorStop(1, withAlpha(accent, 0));
    const vignette = ctx.createRadialGradient(REEL_W / 2, REEL_H / 2, REEL_H * 0.35, REEL_W / 2, REEL_H / 2, REEL_H * 0.78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.38)");
    b = { accent, bg, glow, vignette };
    backdrops.set(ctx, b);
  }
  ctx.fillStyle = b.bg;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  // The glow gradient is centred on y=0 in its own space; slide it to where the cube is.
  ctx.save();
  ctx.translate(0, glowY);
  ctx.globalAlpha = 0.85 + 0.15 * pulse;
  ctx.fillStyle = b.glow;
  ctx.fillRect(0, -glowY, REEL_W, REEL_H);
  ctx.restore();
  ctx.fillStyle = b.vignette;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
}
