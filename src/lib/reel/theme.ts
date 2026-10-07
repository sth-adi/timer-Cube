/**
 * What the reel borrows from the page: the theme's accent colour and the
 * app's own fonts. The picture itself is always a dark card (it is a video
 * you post, not a screen), so an accent that works on a light theme —
 * Paper's deep violet — is lifted until it reads on that card.
 */

/** The card's own two background stops (see renderFrame). */
export const REEL_BG_TOP = "#0c0a17";
export const REEL_BG_BOTTOM = "#16112b";

export const DEFAULT_SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DEFAULT_MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const HEX6 = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lin(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `hex` mixed toward white until it has at least `min` contrast against `bg` (unchanged when it already does). */
export function readableOn(hex: string, bg: string, min = 3.5): string {
  if (!HEX6.test(hex)) return hex;
  if (contrast(hex, bg) >= min) return hex.toLowerCase();
  const c = channels(hex);
  for (let step = 1; step <= 20; step++) {
    const k = step / 20;
    const lifted = toHex([c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]);
    if (contrast(lifted, bg) >= min) return lifted;
  }
  return "#ffffff";
}

/** `rgba()` of a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(HEX6.test(hex) ? hex : "#7c5cff");
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface ReelTheme {
  accent: string;
  sans: string;
  mono: string;
}

/** The current page's accent (made readable on the card) and fonts; sensible defaults off the DOM. */
export function readReelTheme(): ReelTheme {
  if (typeof document === "undefined") return { accent: "#7c5cff", sans: DEFAULT_SANS, mono: DEFAULT_MONO };
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue("--accent").trim();
  const accent = readableOn(HEX6.test(raw) ? raw : "#7c5cff", REEL_BG_BOTTOM);
  const family = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? `${v}, ${fallback}` : fallback;
  };
  return { accent, sans: family("--font-geist-sans", DEFAULT_SANS), mono: family("--font-geist-mono", DEFAULT_MONO) };
}
