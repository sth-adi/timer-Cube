/**
 * Pure layout and colour maths for the share images (no canvas, no DOM), so
 * the parts that decide whether a card looks right — safe margins, text
 * fitting, sparkline geometry, theme-colour mixing — can be unit-tested.
 */

export type CardFormat = "portrait" | "link";

export interface CardFormatSpec {
  w: number;
  h: number;
  /** Safe margin on the left and right edges. */
  marginX: number;
  /** Safe margin on the top and bottom edges. */
  marginY: number;
  /** Default pixel density of the exported PNG. */
  scale: number;
}

/**
 * 1080x1350 is the 4:5 portrait feeds show largest; 1200x630 is the size link
 * previews (og:image, chat unfurls) are cut to. The link card is exported at
 * 2x so it stays crisp on retina screens.
 */
export const CARD_FORMATS: Record<CardFormat, CardFormatSpec> = {
  portrait: { w: 1080, h: 1350, marginX: 80, marginY: 88, scale: 1 },
  link: { w: 1200, h: 630, marginX: 60, marginY: 52, scale: 2 },
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area inside the safe margins. */
export function safeBox(spec: CardFormatSpec): Box {
  return { x: spec.marginX, y: spec.marginY, w: spec.w - spec.marginX * 2, h: spec.h - spec.marginY * 2 };
}

/** Splits a box into `n` equal columns separated by `gap`. */
export function columns(box: Box, n: number, gap = 0): Box[] {
  const count = Math.max(1, Math.floor(n));
  const w = (box.w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: box.x + i * (w + gap), y: box.y, w, h: box.h }));
}

/** Grid columns for `n` stat cells: 4 across on the portrait card, but never a ragged row. */
export function gridColumns(n: number, maxAcross: number): number {
  if (n <= 0) return 1;
  if (n <= maxAcross) return n;
  return Math.ceil(n / Math.ceil(n / maxAcross));
}

// ---------------------------------------------------------------------------
// Text fitting
// ---------------------------------------------------------------------------

/**
 * The largest font size, at most `maxPx`, at which text fits `maxWidth`.
 * `widthAt(px)` is the measured width at that size; width is linear in the
 * size for one font, so one measurement is enough, and one more checks it
 * (kerning/hinting can make it slightly nonlinear). Never below `minPx`
 * (callers ellipsize if it still overflows there).
 */
export function fitSize(widthAt: (px: number) => number, maxWidth: number, maxPx: number, minPx: number): number {
  if (maxWidth <= 0) return minPx;
  const w = widthAt(maxPx);
  if (w <= maxWidth) return maxPx;
  let px = Math.max(minPx, Math.floor((maxPx * maxWidth) / w));
  // Nonlinear rounding can leave a pixel or two over; step down until it fits.
  while (px > minPx && widthAt(px) > maxWidth) px -= 1;
  return px;
}

/** `text` cut with an ellipsis so `measure(result) <= maxWidth` (the text itself when it already fits). */
export function ellipsize(text: string, measure: (s: string) => number, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join("").trimEnd() + "…") <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  const head = chars.slice(0, lo).join("").trimEnd();
  return head ? head + "…" : "…";
}

/** Fit to one line: shrink to `minPx`, then ellipsize. Returns the size and the (possibly shortened) text to draw. */
export function fitLine(
  text: string,
  measureAt: (s: string, px: number) => number,
  maxWidth: number,
  maxPx: number,
  minPx: number,
): { text: string; px: number } {
  const px = fitSize((p) => measureAt(text, p), maxWidth, maxPx, minPx);
  if (measureAt(text, px) <= maxWidth) return { text, px };
  return { text: ellipsize(text, (s) => measureAt(s, px), maxWidth), px };
}

/** Word-wraps `text` into at most `maxLines` lines no wider than `maxWidth`; the last line is ellipsized if the text does not all fit. */
export function wrapLines(text: string, measure: (s: string) => number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (!line) {
      // One word wider than the line: it gets its own, ellipsized, line.
      line = ellipsize(w, measure, maxWidth);
      continue;
    }
    if (lines.length === maxLines - 1) break;
    lines.push(line);
    line = w;
  }
  if (i < words.length) {
    // Out of lines with words left: fold the rest into the last line.
    line = ellipsize([line, ...words.slice(i)].join(" "), measure, maxWidth);
  }
  lines.push(line);
  return lines.slice(0, maxLines);
}

// ---------------------------------------------------------------------------
// Sparkline and phase bar geometry
// ---------------------------------------------------------------------------

export interface SparkPoint {
  x: number;
  y: number;
  /** Index into the input series. */
  i: number;
  value: number;
}

export interface SparkGeometry {
  /** Points for finite values, in order. */
  points: SparkPoint[];
  /** Runs of consecutive points: a DNF breaks the line rather than being drawn as a zero. */
  runs: SparkPoint[][];
  /** X positions (and indices) of DNFs, to mark along the bottom edge. */
  dnfs: { x: number; i: number }[];
  /** The fastest point (lowest time), the one to highlight. */
  bestIndex: number | null;
  lastIndex: number | null;
}

/**
 * Lays a series of solve times (null/Infinity = DNF) into `box`. The fastest
 * time is at the top: a card that trends up and to the right is a card that
 * got faster. A flat series sits mid-box; a single point sits in the middle.
 */
export function sparkGeometry(series: (number | null)[], box: Box): SparkGeometry {
  const n = series.length;
  const finite = series.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = finite.length ? Math.min(...finite) : 0;
  const hi = finite.length ? Math.max(...finite) : 0;
  const xAt = (i: number) => (n <= 1 ? box.x + box.w / 2 : box.x + (i / (n - 1)) * box.w);
  const yAt = (v: number) => (hi === lo ? box.y + box.h / 2 : box.y + ((v - lo) / (hi - lo)) * box.h);
  const points: SparkPoint[] = [];
  const runs: SparkPoint[][] = [];
  const dnfs: { x: number; i: number }[] = [];
  let run: SparkPoint[] = [];
  let bestIndex: number | null = null;
  series.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      dnfs.push({ x: xAt(i), i });
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    const p = { x: xAt(i), y: yAt(v), i, value: v };
    points.push(p);
    run.push(p);
    if (bestIndex === null || v < (series[bestIndex] as number)) bestIndex = i;
  });
  if (run.length) runs.push(run);
  const lastIndex = points.length ? points[points.length - 1].i : null;
  return { points, runs, dnfs, bestIndex, lastIndex };
}

export interface BarSegment {
  label: string;
  share: number;
  x: number;
  w: number;
}

/**
 * Widths for a segmented bar of `total` pixels with `gap` between segments.
 * Shares are normalised; every segment keeps at least `minW` (so a tiny phase
 * is still visible) with the surplus taken proportionally from the others.
 */
export function barSegments(parts: { label: string; share: number }[], total: number, gap: number, minW: number): BarSegment[] {
  const n = parts.length;
  if (n === 0) return [];
  const usable = Math.max(0, total - gap * (n - 1));
  const sum = parts.reduce((a, p) => a + Math.max(0, p.share), 0);
  const raw = parts.map((p) => (sum > 0 ? (Math.max(0, p.share) / sum) * usable : usable / n));
  const floor = Math.min(minW, usable / n);
  const small = raw.map((w) => w < floor);
  const taken = raw.reduce((a, w, i) => a + (small[i] ? floor - w : 0), 0);
  const bigTotal = raw.reduce((a, w, i) => a + (small[i] ? 0 : w), 0);
  const widths = raw.map((w, i) => (small[i] ? floor : bigTotal > 0 ? w - (w / bigTotal) * taken : w));
  let x = 0;
  return parts.map((p, i) => {
    const seg = { label: p.label, share: sum > 0 ? Math.max(0, p.share) / sum : 1 / n, x, w: widths[i] };
    x += widths[i] + gap;
    return seg;
  });
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export type RGB = [number, number, number];

/** Reads `#rgb`, `#rrggbb`, `rgb()` / `rgba()` (comma or space syntax) into 0-255 channels; null when it is anything else (`var(...)`, named colours…). */
export function parseCssColor(input: string | null | undefined): { rgb: RGB; a: number } | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { rgb: [r, g, b], a: 1 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => clamp255(v)) as RGB, a: Math.max(0, Math.min(1, a)) };
  }
  return null;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function toHex(rgb: RGB): string {
  return "#" + rgb.map((v) => clamp255(v).toString(16).padStart(2, "0")).join("");
}

export function rgba(rgb: RGB, a: number): string {
  return `rgba(${clamp255(rgb[0])}, ${clamp255(rgb[1])}, ${clamp255(rgb[2])}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** Linear blend: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Multiplies the channels (the per-facing brightness the Gyro Twin bakes into stickers). */
export function shade(rgb: RGB, k: number): RGB {
  return [clamp255(rgb[0] * k), clamp255(rgb[1] * k), clamp255(rgb[2] * k)];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Nudges `fg` toward black or white until it reads on `bg` at `min` contrast (a pale accent on a paper card, say). */
export function ensureContrast(fg: RGB, bg: RGB, min: number): RGB {
  if (contrast(fg, bg) >= min) return fg;
  const target: RGB = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

/** A seeded PRNG (mulberry32) so the film grain is the same on every export. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
