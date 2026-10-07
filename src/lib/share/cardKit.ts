import { drawCardCube } from "./cardCube";
import {
  CARD_FORMATS,
  barSegments,
  ellipsize,
  fitLine,
  fitSize,
  mix,
  rgba,
  seededRandom,
  sparkGeometry,
  type Box,
  type CardFormat,
  type CardFormatSpec,
  type RGB,
} from "./cardLayout";
import type { CardTheme } from "./cardTheme";

/** Canvas drawing pieces shared by the stats card and the DNA cards: one look, written once. */

export interface Card {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  spec: CardFormatSpec;
  format: CardFormat;
  theme: CardTheme;
  /** Canvas pixels per drawing unit. */
  scale: number;
}

/** A canvas of the format's size at its export density, with a transform so callers draw in format units. Null when 2D canvas is unavailable. */
export function createCard(format: CardFormat, theme: CardTheme, scale?: number): Card | { canvas: HTMLCanvasElement; ctx: null } {
  const spec = CARD_FORMATS[format];
  const s = scale ?? spec.scale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(spec.w * s);
  canvas.height = Math.round(spec.h * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, ctx: null };
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { canvas, ctx, spec, format, theme, scale: s };
}

export const font = (weight: number | string, px: number, family: string) => `${weight} ${px}px ${family}`;

/** Letter-spacing where the browser supports it (Chrome, Firefox, recent Safari); a no-op elsewhere. */
export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function setTextQuality(ctx: CanvasRenderingContext2D): void {
  const c = ctx as CanvasRenderingContext2D & { textRendering?: string; fontKerning?: string };
  if ("textRendering" in c) c.textRendering = "geometricPrecision";
  if ("fontKerning" in c) c.fontKerning = "normal";
}

/** Measures `text` at `weight`/`px`/`tracking`. */
export function measure(ctx: CanvasRenderingContext2D, text: string, weight: number | string, px: number, family: string, tracking = 0): number {
  ctx.font = font(weight, px, family);
  setTracking(ctx, tracking);
  const w = ctx.measureText(text).width;
  setTracking(ctx, 0);
  return w;
}

export interface TextStyle {
  weight?: number | string;
  px: number;
  family: string;
  color: string | CanvasGradient;
  tracking?: number;
  align?: CanvasTextAlign;
}

/** Draws one line of text; returns the width drawn. */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, st: TextStyle): number {
  ctx.save();
  setTextQuality(ctx);
  ctx.font = font(st.weight ?? 500, st.px, st.family);
  setTracking(ctx, st.tracking ?? 0);
  ctx.textAlign = st.align ?? "left";
  ctx.fillStyle = st.color;
  const w = ctx.measureText(s).width;
  ctx.fillText(s, x, y);
  ctx.restore();
  return w;
}

export interface FitStyle extends Omit<TextStyle, "px"> {
  maxPx: number;
  minPx: number;
}

/** Fits `s` to `maxWidth` (shrinking, then ellipsizing), draws it, and returns what was drawn. */
export function fitText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxWidth: number, st: FitStyle): { text: string; px: number; width: number } {
  const family = st.family;
  const weight = st.weight ?? 500;
  const tracking = st.tracking ?? 0;
  const fit = fitLine(s, (t, px) => measure(ctx, t, weight, px, family, tracking), maxWidth, st.maxPx, st.minPx);
  const width = text(ctx, fit.text, x, y, { ...st, px: fit.px });
  return { text: fit.text, px: fit.px, width };
}

/** Small tracked caps ("LAST 40 SOLVES"), fitted to `maxWidth`. */
export function caps(card: Card, s: string, x: number, y: number, maxWidth: number, opts: { px?: number; color?: string; align?: CanvasTextAlign; weight?: number } = {}): void {
  const { ctx, theme } = card;
  const px = opts.px ?? 24;
  fitText(ctx, s.toUpperCase(), x, y, maxWidth, {
    maxPx: px,
    minPx: Math.max(12, Math.round(px * 0.6)),
    family: theme.fontSans,
    weight: opts.weight ?? 650,
    color: opts.color ?? rgba(theme.muted, 1),
    tracking: px * 0.12,
    align: opts.align,
  });
}

export function roundRectPath(ctx: CanvasRenderingContext2D, b: Box, r: number): void {
  const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2));
  ctx.beginPath();
  ctx.moveTo(b.x + rr, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, rr);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, rr);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, rr);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, rr);
  ctx.closePath();
}

let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  try {
    const t = document.createElement("canvas");
    t.width = 192;
    t.height = 192;
    const g = t.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(192, 192);
    const rand = seededRandom(0xc0be);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = t;
    return t;
  } catch {
    return null;
  }
}

/**
 * The card background: a vertical wash of the theme's own surface colours, a
 * big accent glow in one corner and a cooler one in the opposite, a faint
 * vignette, film grain, and a hairline frame. Flat and calm, not a screensaver.
 */
export function paintBackground(card: Card, glowAt: "right" | "left" = "right"): void {
  const { ctx, spec, theme, scale } = card;
  const { w, h } = spec;
  const light = theme.isLight;

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, rgba(mix(theme.bg, theme.bgElevated, light ? 0 : 0.7), 1));
  base.addColorStop(1, rgba(mix(theme.bg, light ? theme.fg : [0, 0, 0], light ? 0.04 : 0.45), 1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const big = Math.max(w, h) * (card.format === "portrait" ? 0.78 : 0.62);
  const gx = glowAt === "right" ? w * 0.92 : w * 0.08;
  const g1 = ctx.createRadialGradient(gx, h * 0.04, 0, gx, h * 0.04, big);
  g1.addColorStop(0, rgba(theme.accent, light ? 0.16 : 0.3));
  g1.addColorStop(1, rgba(theme.accent, 0));
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2x = glowAt === "right" ? w * 0.05 : w * 0.95;
  const g2 = ctx.createRadialGradient(g2x, h * 1.0, 0, g2x, h * 1.0, big * 0.8);
  g2.addColorStop(0, rgba(theme.cyan, light ? 0.1 : 0.13));
  g2.addColorStop(1, rgba(theme.cyan, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  if (!light) {
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  const tile = grain();
  if (tile) {
    const pat = ctx.createPattern(tile, "repeat");
    if (pat) {
      try {
        pat.setTransform(new DOMMatrix().scale(1 / scale));
      } catch {
        // No DOMMatrix: the grain is just a little coarser at 2x.
      }
      ctx.save();
      ctx.globalAlpha = light ? 0.035 : 0.045;
      ctx.globalCompositeOperation = light ? "multiply" : "overlay";
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  const inset = card.format === "portrait" ? 30 : 20;
  roundRectPath(ctx, { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 }, card.format === "portrait" ? 44 : 30);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(theme.fg, light ? 0.08 : 0.07);
  ctx.stroke();
}

/** A raised panel: a faint fill, a hairline border and a lit top edge. */
export function panel(card: Card, b: Box, radius = 28): void {
  const { ctx, theme } = card;
  const light = theme.isLight;
  ctx.save();
  if (light) {
    ctx.shadowColor = rgba(theme.fg, 0.08);
    ctx.shadowBlur = 24 * card.scale;
    ctx.shadowOffsetY = 8 * card.scale;
  }
  roundRectPath(ctx, b, radius);
  const f = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  if (light) {
    f.addColorStop(0, "rgba(255,255,255,0.92)");
    f.addColorStop(1, "rgba(255,255,255,0.72)");
  } else {
    f.addColorStop(0, rgba(theme.fg, 0.075));
    f.addColorStop(1, rgba(theme.fg, 0.035));
  }
  ctx.fillStyle = f;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, b, radius);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(theme.fg, light ? 0.1 : 0.1);
  ctx.stroke();
}

/** The cube mark and the wordmark, top-left at (x, y); returns the height used. */
export function brandMark(card: Card, x: number, y: number, cubeSize: number, label = "Cube Timer", sub = ""): { width: number; height: number } {
  const { ctx, theme } = card;
  const cw = (cubeSize * 6 * Math.cos(Math.PI / 6)) / 6;
  const cx = x + cw / 2;
  const cy = y + cubeSize / 2;
  drawCardCube(ctx, cx, cy, cubeSize, {
    glow: rgba(theme.accent, theme.isLight ? 0.1 : 0.16),
    shadowStrength: theme.isLight ? 0.5 : 1,
    pixelRatio: card.scale,
  });
  const tx = x + cw + cubeSize * 0.3;
  const big = Math.round(cubeSize * 0.4);
  const wordW = text(card.ctx, label, tx, y + cubeSize * (sub ? 0.5 : 0.62), { px: big, weight: 800, family: theme.fontSans, color: rgba(theme.fg, 1), tracking: -big * 0.01 });
  if (sub) caps(card, sub, tx, y + cubeSize * 0.5 + big * 0.85, Math.max(60, wordW + 60), { px: Math.round(big * 0.5), color: rgba(theme.muted, 1) });
  return { width: cw + cubeSize * 0.3 + wordW, height: cubeSize };
}

/** The accent, lifted a little on dark and deepened on light, for text that must read. */
export function heroGradient(card: Card, y0: number, y1: number): CanvasGradient {
  const { ctx, theme } = card;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  const top = theme.isLight ? mix(theme.accent, theme.fg, 0.05) : mix(theme.accent, [255, 255, 255], 0.42);
  const bottom = theme.isLight ? mix(theme.accent, theme.fg, 0.28) : theme.accent;
  g.addColorStop(0, rgba(top, 1));
  g.addColorStop(1, rgba(bottom, 1));
  return g;
}

/** Soft glow behind subsequent drawing (dark themes only). */
export function withGlow(card: Card, color: RGB, blur: number, draw: () => void): void {
  const { ctx, theme } = card;
  ctx.save();
  if (!theme.isLight) {
    ctx.shadowColor = rgba(color, 0.4);
    ctx.shadowBlur = blur * card.scale;
  }
  draw();
  ctx.restore();
}

export interface SparkOptions {
  /** Shown top-left in the panel, e.g. "LAST 40 SOLVES". */
  title: string;
  /** Shown top-right, e.g. "BEST 8.42". */
  badge?: string;
  /** Formats a time for the latest-point label. */
  formatValue?: (ms: number) => string;
}

/** A panel with a sparkline of solve times: fastest highest, DNFs as ticks along the bottom, best point ringed, latest point filled. */
export function sparkPanel(card: Card, b: Box, series: (number | null)[], opts: SparkOptions): void {
  const { ctx, theme } = card;
  panel(card, b, 28);
  const pad = Math.round(Math.min(b.w, b.h) * 0.11);
  const padX = Math.max(26, pad);
  const headY = b.y + padX + 14;
  caps(card, opts.title, b.x + padX, headY, b.w * 0.55 - padX, { px: 22 });
  if (opts.badge) caps(card, opts.badge, b.x + b.w - padX, headY, b.w * 0.45 - padX, { px: 22, color: rgba(theme.accent, 1), align: "right" });

  const chart: Box = { x: b.x + padX + 8, y: headY + 34, w: b.w - padX * 2 - 16, h: b.y + b.h - padX - 8 - (headY + 34) };
  if (chart.h < 20 || chart.w < 40) return;
  const accent = theme.isLight ? mix(theme.accent, theme.fg, 0.1) : theme.accent;

  // Three faint guides.
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(theme.fg, 0.07);
  ctx.setLineDash([2, 8]);
  for (let i = 0; i < 3; i++) {
    const gy = chart.y + (chart.h * i) / 2;
    ctx.beginPath();
    ctx.moveTo(chart.x, gy);
    ctx.lineTo(chart.x + chart.w, gy);
    ctx.stroke();
  }
  ctx.restore();

  const geo = sparkGeometry(series, { x: chart.x, y: chart.y + 10, w: chart.w, h: chart.h - 24 });
  const lw = Math.max(3, Math.min(5, chart.h / 40));

  // Area under each run.
  for (const run of geo.runs) {
    if (run.length < 2) continue;
    const fill = ctx.createLinearGradient(0, chart.y, 0, chart.y + chart.h);
    fill.addColorStop(0, rgba(accent, 0.3));
    fill.addColorStop(1, rgba(accent, 0));
    ctx.beginPath();
    ctx.moveTo(run[0].x, chart.y + chart.h);
    for (const p of run) ctx.lineTo(p.x, p.y);
    ctx.lineTo(run[run.length - 1].x, chart.y + chart.h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  // Lines.
  withGlow(card, accent, 14, () => {
    ctx.strokeStyle = rgba(accent, 1);
    ctx.lineWidth = lw;
    for (const run of geo.runs) {
      ctx.beginPath();
      run.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (run.length === 1) ctx.lineTo(run[0].x + 0.01, run[0].y);
      ctx.stroke();
    }
  });
  // DNF ticks.
  ctx.strokeStyle = rgba(theme.danger, 0.9);
  ctx.lineWidth = 3;
  for (const d of geo.dnfs) {
    const y = chart.y + chart.h - 6;
    ctx.beginPath();
    ctx.moveTo(d.x - 5, y - 5);
    ctx.lineTo(d.x + 5, y + 5);
    ctx.moveTo(d.x + 5, y - 5);
    ctx.lineTo(d.x - 5, y + 5);
    ctx.stroke();
  }
  const surface = theme.isLight ? ([255, 255, 255] as RGB) : mix(theme.bg, theme.bgElevated, 0.6);
  const dot = (i: number | null, r: number, ring: boolean) => {
    if (i === null) return;
    const p = geo.points.find((q) => q.i === i);
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ring ? rgba(surface, 1) : rgba(accent, 1);
    ctx.fill();
    ctx.lineWidth = ring ? 4 : 3;
    ctx.strokeStyle = rgba(ring ? theme.success : surface, 1);
    ctx.stroke();
  };
  if (geo.bestIndex !== geo.lastIndex) dot(geo.bestIndex, 9, true);
  dot(geo.lastIndex, 9, false);
  if (geo.lastIndex === geo.bestIndex) dot(geo.bestIndex, 11, true);
}

export interface PhaseShare {
  label: string;
  share: number;
  meanMs?: number;
}

/** A panel with the average solve split into its phases as one segmented bar, labelled under each segment. */
export function phasePanel(card: Card, b: Box, phases: PhaseShare[], formatMs: (ms: number) => string): void {
  const { ctx, theme } = card;
  panel(card, b, 28);
  const padX = 30;
  caps(card, "Where the time goes", b.x + padX, b.y + 38, b.w - padX * 2, { px: 22 });
  const tints: RGB[] = [theme.accent, theme.cyan, theme.warning, theme.success];
  const barH = 20;
  const barY = b.y + 56;
  const segs = barSegments(phases.map((p) => ({ label: p.label, share: p.share })), b.w - padX * 2, 6, 64);
  const valueOf = (i: number) => `${Math.round(segs[i].share * 100)}%${phases[i].meanMs !== undefined ? ` · ${formatMs(phases[i].meanMs!)}` : ""}`;
  // One size for every label and one for every value, so a narrow phase does not shrink out of step with its neighbours.
  let labelPx = 19;
  let valuePx = 21;
  segs.forEach((s, i) => {
    const room = Math.max(10, s.w - 14);
    labelPx = Math.min(labelPx, fitSize((px) => measure(ctx, s.label.toUpperCase(), 650, px, theme.fontSans, px * 0.12), room, 19, 13));
    valuePx = Math.min(valuePx, fitSize((px) => measure(ctx, valueOf(i), 600, px, theme.fontSans), room, 21, 13));
  });
  segs.forEach((s, i) => {
    const sx = b.x + padX + s.x;
    roundRectPath(ctx, { x: sx, y: barY, w: s.w, h: barH }, 8);
    const c = tints[i % tints.length];
    const g = ctx.createLinearGradient(0, barY, 0, barY + barH);
    g.addColorStop(0, rgba(mix(c, [255, 255, 255], 0.18), 1));
    g.addColorStop(1, rgba(c, 1));
    ctx.fillStyle = g;
    ctx.fill();
    const labelW = s.w + 2;
    caps(card, s.label, sx, barY + barH + 30, labelW, { px: labelPx, color: rgba(theme.fg, 0.9), weight: 650 });
    fitText(ctx, valueOf(i), sx, barY + barH + 56, labelW, { maxPx: valuePx, minPx: valuePx, family: theme.fontSans, weight: 600, color: rgba(theme.muted, 1) });
  });
}

/** The big cube as an emblem, centred in `b` (used when there is no trend to show). */
export function emblem(card: Card, b: Box): void {
  const size = Math.min(b.h * 0.8, b.w * 0.5, 300);
  drawCardCube(card.ctx, b.x + b.w / 2, b.y + b.h / 2 - size * 0.04, size, {
    glow: rgba(card.theme.accent, card.theme.isLight ? 0.1 : 0.16),
    shadowStrength: card.theme.isLight ? 0.5 : 1,
    pixelRatio: card.scale,
  });
}

/** Footer line: the date on the left, a signature on the right; neither can run into the other. */
export function footer(card: Card, baselineY: number, left: string, right: string, rightEdge?: number): void {
  const { ctx, theme, spec } = card;
  const x0 = spec.marginX;
  const x1 = rightEdge ?? spec.w - spec.marginX;
  const px = card.format === "portrait" ? 26 : 22;
  const family = theme.fontSans;
  const leftW = measure(ctx, left, 500, px, family);
  text(ctx, left, x0, baselineY, { px, weight: 500, family, color: rgba(theme.muted, 0.9) });
  const room = x1 - x0 - leftW - 40;
  if (room > 60 && right) {
    const shown = ellipsize(right, (s) => measure(ctx, s, 600, px, family), room);
    text(ctx, shown, x1, baselineY, { px, weight: 600, family, color: rgba(theme.muted, 0.9), align: "right" });
  }
}
