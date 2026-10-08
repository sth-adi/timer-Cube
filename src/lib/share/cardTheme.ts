import { luminance, parseCssColor, type RGB } from "./cardLayout";

/** The colours and fonts a share image is painted with: the active theme's own CSS variables, so a card looks like the app that made it. */
export interface CardTheme {
  isLight: boolean;
  bg: RGB;
  bgElevated: RGB;
  fg: RGB;
  muted: RGB;
  accent: RGB;
  cyan: RGB;
  success: RGB;
  warning: RGB;
  danger: RGB;
  /** CSS font-family list for ctx.font (already resolved, never a var()). */
  fontSans: string;
  fontMono: string;
}

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The default (Slate, id "nebula", dark) palette: what a card falls back to with no document, or a variable that will not parse. */
export const DEFAULT_CARD_THEME: CardTheme = {
  isLight: false,
  bg: [12, 14, 18],
  bgElevated: [24, 27, 34],
  fg: [232, 235, 242],
  muted: [155, 162, 179],
  accent: [111, 155, 232],
  cyan: [134, 179, 212],
  success: [70, 201, 138],
  warning: [226, 167, 62],
  danger: [236, 107, 125],
  fontSans: SANS_FALLBACK,
  fontMono: MONO_FALLBACK,
};

function readColor(style: CSSStyleDeclaration, name: string, fallback: RGB): RGB {
  return parseCssColor(style.getPropertyValue(name))?.rgb ?? fallback;
}

/** A font-family value that is safe to put in `ctx.font` (non-empty, no var()), else the fallback. */
export function usableFamily(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (!v || v.includes("var(")) return fallback;
  return `${v}, ${fallback}`;
}

/** Reads the active theme from the document root; the default palette when there is no document. */
export function readCardTheme(): CardTheme {
  if (typeof document === "undefined") return DEFAULT_CARD_THEME;
  try {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const d = DEFAULT_CARD_THEME;
    const bg = readColor(style, "--background", d.bg);
    const body = document.body ? getComputedStyle(document.body) : style;
    // The mono var is a resolved family list on :root (next/font); the body carries the sans in use (terminal swaps it to mono).
    const monoVar = style.getPropertyValue("--font-mono");
    return {
      isLight: luminance(bg) > 0.5,
      bg,
      bgElevated: readColor(style, "--bg-elevated", d.bgElevated),
      fg: readColor(style, "--foreground", d.fg),
      muted: readColor(style, "--muted", d.muted),
      accent: readColor(style, "--accent", d.accent),
      cyan: readColor(style, "--cyan", d.cyan),
      success: readColor(style, "--success", d.success),
      warning: readColor(style, "--warning", d.warning),
      danger: readColor(style, "--danger", d.danger),
      fontSans: usableFamily(body.fontFamily, SANS_FALLBACK),
      fontMono: usableFamily(monoVar, MONO_FALLBACK),
    };
  } catch {
    return DEFAULT_CARD_THEME;
  }
}

let warmed: Promise<void> | null = null;

/**
 * Resolves once the app fonts the cards use are loaded (or after a short
 * timeout, so a blocked font never stalls the share button): canvas text drawn
 * before that silently uses the fallback face. Safe to call repeatedly.
 */
export function ensureCardFonts(theme: CardTheme = readCardTheme()): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const loads = ["500", "600", "700", "800"].map((w) => document.fonts.load(`${w} 32px ${theme.fontSans}`).catch(() => []));
  const ready = Promise.all([...loads, document.fonts.ready]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  return Promise.race([ready, timeout]);
}

/** Starts loading the fonts at import time, so the synchronous draw functions find them ready when someone taps Share. */
export function warmCardFonts(): void {
  if (warmed || typeof document === "undefined") return;
  warmed = ensureCardFonts();
}
