import type { DnaAxis } from "@/lib/stats/dna";
import {
  brandMark,
  caps,
  createCard,
  emblem,
  fitText,
  footer,
  heroGradient,
  measure,
  paintBackground,
  panel,
  sparkPanel,
  text,
  withGlow,
  type Card,
} from "./cardKit";
import { mix, rgba, safeBox, wrapLines, type Box, type CardFormat, type RGB } from "./cardLayout";
import { ensureCardFonts, readCardTheme, warmCardFonts } from "./cardTheme";

warmCardFonts();

export interface DnaCardOptions {
  sessionName: string;
  axes: DnaAxis[];
  /** "portrait" (1080x1350, the default) or "link" (1200x630, exported at 2x). */
  format?: CardFormat;
  /** Shown bottom-right as @name when given. */
  username?: string | null;
  date?: Date;
}

const angleOf = (i: number, n: number) => (i / n) * Math.PI * 2;

/** Strongest and weakest axis (null when there is nothing to compare). */
export function extremes(axes: DnaAxis[]): { best: DnaAxis; worst: DnaAxis } | null {
  if (axes.length < 2) return null;
  let best = axes[0];
  let worst = axes[0];
  for (const a of axes) {
    if (a.score > best.score) best = a;
    if (a.score < worst.score) worst = a;
  }
  return best === worst || best.score === worst.score ? null : { best, worst };
}

function dateLabel(d?: Date): string {
  return (d ?? new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function userLabel(u?: string | null): string {
  const t = u?.trim();
  return t ? `@${t.replace(/^@/, "")}` : "";
}

function polar(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function polyPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radii: number[]) {
  ctx.beginPath();
  radii.forEach((r, i) => {
    const p = polar(cx, cy, r, angleOf(i, radii.length));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

interface RadarBounds {
  /** Leftmost / rightmost x a label may reach. */
  left: number;
  right: number;
}

/** The full-size radar: rings, spokes, the filled shape, vertex dots, and each axis labelled with its score; labels shrink to stay inside `bounds`. */
function drawRadar(card: Card, cx: number, cy: number, R: number, axes: DnaAxis[], bounds: RadarBounds) {
  const { ctx, theme } = card;
  const n = axes.length;
  const accent: RGB = theme.isLight ? mix(theme.accent, theme.fg, 0.08) : theme.accent;

  for (const k of [1 / 3, 2 / 3, 1]) {
    polyPath(ctx, cx, cy, Array(n).fill(R * k));
    ctx.lineWidth = k === 1 ? 2 : 1.5;
    ctx.strokeStyle = rgba(theme.fg, k === 1 ? 0.18 : 0.09);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(theme.fg, 0.09);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const p = polar(cx, cy, R, angleOf(i, n));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  const radii = axes.map((a) => (Math.max(0, Math.min(100, a.score)) / 100) * R);
  const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  fill.addColorStop(0, rgba(accent, 0.12));
  fill.addColorStop(1, rgba(accent, theme.isLight ? 0.34 : 0.42));
  polyPath(ctx, cx, cy, radii);
  ctx.fillStyle = fill;
  ctx.fill();
  withGlow(card, accent, 22, () => {
    polyPath(ctx, cx, cy, radii);
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba(accent, 1);
    ctx.stroke();
  });

  const surface: RGB = theme.isLight ? [255, 255, 255] : mix(theme.bg, theme.bgElevated, 0.6);
  radii.forEach((r, i) => {
    const p = polar(cx, cy, r, angleOf(i, n));
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = rgba(accent, 1);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(surface, 1);
    ctx.stroke();
  });

  axes.forEach((a, i) => {
    const ang = angleOf(i, n);
    const sin = Math.sin(ang);
    const cos = Math.cos(ang);
    const p = polar(cx, cy, R + 30, ang);
    const align: CanvasTextAlign = sin > 0.3 ? "left" : sin < -0.3 ? "right" : "center";
    const room = align === "left" ? bounds.right - p.x : align === "right" ? p.x - bounds.left : 2 * Math.min(p.x - bounds.left, bounds.right - p.x);
    const maxW = Math.max(40, room);
    // Above the point for the top spoke, below for the bottom, level for the sides.
    const top = cos > 0.5 ? -58 : cos < -0.5 ? 4 : -26;
    fitText(ctx, a.label, p.x, p.y + top + 24, maxW, {
      maxPx: 25,
      minPx: 15,
      family: theme.fontSans,
      weight: 750,
      color: rgba(theme.fg, 1),
      align,
    });
    text(ctx, String(Math.round(a.score)), p.x, p.y + top + 52, {
      px: 26,
      weight: 650,
      family: theme.fontSans,
      color: rgba(accent, 1),
      align,
    });
  });
}

/** A "strongest" / "room to grow" tile: caption, the axis name (fitted) and its score. */
function extremeTile(card: Card, b: Box, caption: string, axis: DnaAxis, tone: RGB) {
  const { ctx, theme } = card;
  panel(card, b, 24);
  const compact = b.h < 110;
  const pad = compact ? 18 : 26;
  caps(card, caption, b.x + pad, b.y + pad + (compact ? 12 : 14), b.w - pad * 2, { px: compact ? 16 : 18, color: rgba(tone, 1) });
  const scoreText = String(Math.round(axis.score));
  const scorePx = Math.min(54, b.h * (compact ? 0.42 : 0.5));
  const scoreW = measure(ctx, scoreText, 800, scorePx, theme.fontSans);
  text(ctx, scoreText, b.x + b.w - pad, b.y + b.h - pad, { px: scorePx, weight: 800, family: theme.fontSans, color: rgba(theme.fg, 1), align: "right", tracking: -1 });
  fitText(ctx, axis.label, b.x + pad, b.y + b.h - pad - 2, Math.max(40, b.w - pad * 2 - scoreW - 14), {
    maxPx: compact ? 30 : 34,
    minPx: 18,
    family: theme.fontSans,
    weight: 700,
    color: rgba(theme.fg, 1),
  });
}

/**
 * The shareable poster for a solver's "DNA": the same self-referential radar
 * axes the on-page RadarChart draws, re-rendered on a canvas at export
 * resolution in the theme's own colours, with the strongest and weakest axis
 * called out.
 */
export function drawDnaCard(opts: DnaCardOptions): HTMLCanvasElement {
  const format = opts.format ?? "portrait";
  const theme = readCardTheme();
  const card = createCard(format, theme);
  if (!card.ctx) return card.canvas;
  const { ctx, spec } = card;
  const safe = safeBox(spec);
  const portrait = format === "portrait";
  const sans = theme.fontSans;
  const name = opts.sessionName.trim() || "Session";
  const n = opts.axes.length;
  const ext = extremes(opts.axes);

  paintBackground(card, "left");
  const cube = portrait ? 112 : 76;
  brandMark(card, safe.x, safe.y, cube, "Cube Timer", "Cube DNA");

  if (portrait) {
    const titleBase = safe.y + cube + 36 + 104;
    fitText(ctx, "Cube DNA", safe.x - 3, titleBase, safe.w, {
      maxPx: 120,
      minPx: 60,
      family: sans,
      weight: 800,
      color: heroGradient(card, titleBase - 90, titleBase),
      tracking: -2.5,
    });
    fitText(ctx, name, safe.x, titleBase + 52, safe.w, { maxPx: 36, minPx: 22, family: sans, weight: 600, color: rgba(theme.muted, 1) });

    const tileH = 112;
    const tilesY = safe.y + safe.h - 52 - tileH - 14;
    const cy = titleBase + 52 + 110 + 235;
    if (n >= 3) {
      drawRadar(card, spec.w / 2, Math.min(cy, tilesY - 235 - 90), 235, opts.axes, { left: safe.x - 8, right: safe.x + safe.w + 8 });
    } else {
      emblem(card, { x: safe.x, y: titleBase + 90, w: safe.w, h: tilesY - titleBase - 110 });
    }
    if (ext) {
      const w = (safe.w - 24) / 2;
      extremeTile(card, { x: safe.x, y: tilesY, w, h: tileH }, "Strongest", ext.best, theme.success);
      extremeTile(card, { x: safe.x + w + 24, y: tilesY, w, h: tileH }, "Room to grow", ext.worst, theme.warning);
    }
    footer(card, safe.y + safe.h, dateLabel(opts.date), userLabel(opts.username));
    return card.canvas;
  }

  // Link preview: the story on the left, the radar on the right.
  const leftW = Math.round(safe.w * 0.44);
  const rightX = safe.x + leftW + 40;
  const titleBase = safe.y + cube + 22 + 84;
  fitText(ctx, "Cube DNA", safe.x - 2, titleBase, leftW, {
    maxPx: 96,
    minPx: 48,
    family: sans,
    weight: 800,
    color: heroGradient(card, titleBase - 72, titleBase),
    tracking: -2,
  });
  fitText(ctx, name, safe.x, titleBase + 40, leftW, { maxPx: 30, minPx: 18, family: sans, weight: 600, color: rgba(theme.muted, 1) });
  if (ext) {
    const h = 108;
    const y1 = safe.y + safe.h - 46 - h * 2 - 14;
    extremeTile(card, { x: safe.x, y: y1, w: leftW, h }, "Strongest", ext.best, theme.success);
    extremeTile(card, { x: safe.x, y: y1 + h + 14, w: leftW, h }, "Room to grow", ext.worst, theme.warning);
  }
  const rcx = rightX + (safe.x + safe.w - rightX) / 2;
  if (n >= 3) drawRadar(card, rcx, safe.y + safe.h / 2 - 4, 168, opts.axes, { left: rightX - 12, right: safe.x + safe.w + 4 });
  else emblem(card, { x: rightX, y: safe.y, w: safe.x + safe.w - rightX, h: safe.h - 40 });
  footer(card, safe.y + safe.h, dateLabel(opts.date), userLabel(opts.username));
  return card.canvas;
}

/** `drawDnaCard` once the app fonts are loaded. */
export async function renderDnaCard(opts: DnaCardOptions): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  return drawDnaCard(opts);
}

function miniRadar(card: Card, cx: number, cy: number, R: number, axes: DnaAxis[], ghost: DnaAxis[] | null) {
  const { ctx, theme } = card;
  const n = axes.length;
  if (n < 3) return;
  const accent: RGB = theme.isLight ? mix(theme.accent, theme.fg, 0.08) : theme.accent;
  polyPath(ctx, cx, cy, Array(n).fill(R));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(theme.fg, 0.14);
  ctx.stroke();
  polyPath(ctx, cx, cy, Array(n).fill(R * 0.5));
  ctx.strokeStyle = rgba(theme.fg, 0.07);
  ctx.stroke();
  const ghostScores = ghost ? axes.map((a) => ghost.find((g) => g.label === a.label)?.score) : null;
  if (ghostScores && ghostScores.every((x) => x !== undefined)) {
    polyPath(ctx, cx, cy, ghostScores.map((x) => ((x as number) / 100) * R));
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(theme.fg, 0.4);
    ctx.stroke();
    ctx.restore();
  }
  const radii = axes.map((a) => (Math.max(0, Math.min(100, a.score)) / 100) * R);
  polyPath(ctx, cx, cy, radii);
  ctx.fillStyle = rgba(accent, theme.isLight ? 0.24 : 0.3);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = rgba(accent, 1);
  ctx.stroke();
}

export interface DnaTimelineOptions {
  sessionName: string;
  snapshots: { label: string; axes: DnaAxis[]; trait: { name: string }; meanMs: number | null }[];
  headline: string;
  /** Portrait (default) shows up to six periods and the average-time trend; "link" shows the latest three. */
  format?: CardFormat;
  username?: string | null;
  date?: Date;
}

/**
 * The evolution poster: the last few periods' radars side by side (each
 * with the one before ghosted behind it), the trait that defined each, and
 * the average-time trend underneath.
 */
export function drawDnaTimelineCard(opts: DnaTimelineOptions): HTMLCanvasElement {
  const format = opts.format ?? "portrait";
  const theme = readCardTheme();
  const card = createCard(format, theme);
  if (!card.ctx) return card.canvas;
  const { ctx, spec } = card;
  const safe = safeBox(spec);
  const portrait = format === "portrait";
  const sans = theme.fontSans;

  paintBackground(card, "left");
  const cube = portrait ? 96 : 64;
  brandMark(card, safe.x, safe.y, cube, "Cube Timer", "Cube DNA");

  const titleBase = safe.y + cube + (portrait ? 112 : 84);
  fitText(ctx, "Evolution", safe.x - 2, titleBase, portrait ? safe.w : safe.w * 0.5, {
    maxPx: portrait ? 104 : 84,
    minPx: 48,
    family: sans,
    weight: 800,
    color: heroGradient(card, titleBase - 78, titleBase),
    tracking: -2,
  });
  const name = opts.sessionName.trim() || "Session";
  if (portrait) fitText(ctx, name, safe.x, titleBase + 50, safe.w, { maxPx: 32, minPx: 20, family: sans, weight: 600, color: rgba(theme.muted, 1) });
  else fitText(ctx, name, safe.x + safe.w, titleBase - 8, safe.w * 0.42, { maxPx: 30, minPx: 18, family: sans, weight: 600, color: rgba(theme.muted, 1), align: "right" });

  const headline = opts.headline.trim();
  let gridTop = titleBase + (portrait ? 150 : 40);
  if (headline && portrait) {
    const lines = wrapLines(headline, (s) => measure(ctx, s, 500, 30, sans), safe.w, 2);
    lines.forEach((l, i) => text(ctx, l, safe.x, titleBase + 104 + i * 40, { px: 30, weight: 500, family: sans, color: rgba(theme.fg, 0.86) }));
    gridTop = titleBase + 104 + lines.length * 40 + 24;
  }

  const shown = opts.snapshots.slice(portrait ? -6 : -3);
  const cols = 3;
  const gap = 20;
  const cellW = (safe.w - gap * (cols - 1)) / cols;
  const means = shown.map((s) => s.meanMs);
  const finiteMeans = means.filter((m): m is number => m !== null);
  const trendOn = portrait && finiteMeans.length >= 2;
  const rows = Math.ceil(shown.length / cols);
  const footerY = safe.y + safe.h;
  const rows1 = shown.length <= cols;
  const trendH = trendOn ? (rows1 ? 300 : 176) : 0;
  const gridBottom = footerY - 52 - (trendOn ? trendH + 22 : 0);
  const cellH = portrait ? Math.min(rows1 ? 380 : 250, (gridBottom - gridTop - gap * (rows - 1)) / Math.max(1, rows)) : gridBottom - (headline ? 70 : 0) - (gridTop + 20);
  const cellTop = portrait ? gridTop : gridTop + 20;

  shown.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const b: Box = { x: safe.x + col * (cellW + gap), y: cellTop + row * (cellH + gap), w: cellW, h: cellH };
    panel(card, b, 26);
    const R = Math.min(rows1 ? 112 : 78, (b.h - 96) / 2, b.w / 2 - 36);
    miniRadar(card, b.x + b.w / 2, b.y + 20 + R + 8, R, s.axes, i > 0 ? shown[i - 1].axes : null);
    const pad = 18;
    fitText(ctx, s.label, b.x + b.w / 2, b.y + b.h - 44, b.w - pad * 2, { maxPx: 27, minPx: 15, family: sans, weight: 750, color: rgba(theme.fg, 1), align: "center" });
    fitText(ctx, s.trait.name, b.x + b.w / 2, b.y + b.h - 16, b.w - pad * 2, { maxPx: 22, minPx: 14, family: sans, weight: 650, color: rgba(theme.accent, 1), align: "center" });
  });

  if (trendOn) {
    sparkPanel(card, { x: safe.x, y: footerY - 52 - trendH, w: safe.w, h: trendH }, means, {
      title: "Average time",
      badge: `Now ${(finiteMeans[finiteMeans.length - 1] / 1000).toFixed(2)}`,
    });
  }
  if (headline && !portrait) {
    const lines = wrapLines(headline, (s) => measure(ctx, s, 500, 24, sans), safe.w, 2);
    lines.forEach((l, i) => text(ctx, l, safe.x, footerY - 46 - (lines.length - 1 - i) * 32, { px: 24, weight: 500, family: sans, color: rgba(theme.fg, 0.86) }));
  }

  footer(card, footerY, dateLabel(opts.date), userLabel(opts.username));
  return card.canvas;
}

/** `drawDnaTimelineCard` once the app fonts are loaded. */
export async function renderDnaTimelineCard(opts: DnaTimelineOptions): Promise<HTMLCanvasElement> {
  await ensureCardFonts();
  return drawDnaTimelineCard(opts);
}
