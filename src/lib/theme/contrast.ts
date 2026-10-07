/**
 * WCAG contrast maths and a reader for the theme tokens in app/globals.css, so a test can compute (not
 * eyeball) that every text colour a theme defines stays >= 4.5:1 on every surface that text can sit on.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses `#rgb`, `#rrggbb`, `rgb(...)` and `rgba(...)` (comma form); null for anything else. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const fn = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  return null;
}

/** `top` painted over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** WCAG 2.x relative luminance of an opaque colour. */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1 to 21). A translucent `fg` is first composited over `bg`. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const f = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(f), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Custom properties declared in one `{ ... }` body, in order. */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * The resolved tokens of every theme in a stylesheet: `:root { }` is the default (nebula) palette and each
 * `:root[data-theme="x"] { }` block overrides it. Only plain, single-block rules are read (a comma selector or a
 * compound one is not a palette block), so identity rules in themes.css never leak into the palette.
 */
export function readThemeTokens(css: string, themes: readonly string[]): Record<string, Record<string, string>> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blockOf = (selector: string) => {
    const start = stripped.indexOf(`\n${selector} {`);
    if (start < 0) return {};
    const open = stripped.indexOf("{", start);
    return declarations(stripped.slice(open + 1, stripped.indexOf("}", open)));
  };
  const base = blockOf(":root");
  const result: Record<string, Record<string, string>> = {};
  for (const t of themes) result[t] = t === "nebula" ? { ...base, ...blockOf(':root[data-theme="nebula"]') } : { ...base, ...blockOf(`:root[data-theme="${t}"]`) };
  return result;
}

export const SURFACES = ["--background", "--bg-elevated", "--bg-panel", "--bg-panel-2"] as const;
/** Every token the UI sets text in (text-foreground, text-muted, text-accent, status hues in labels and times). */
export const TEXT_TOKENS = ["--foreground", "--muted", "--muted-2", "--accent", "--success", "--warning", "--danger", "--cyan"] as const;

export type ContrastCheck = { pair: string; ratio: number };

/** Every text-on-surface pair of one theme's tokens, with its contrast ratio. */
export function themeContrasts(tokens: Record<string, string>): ContrastCheck[] {
  const get = (name: string): Rgba => {
    const c = tokens[name] ? parseColor(tokens[name]) : null;
    if (!c) throw new Error(`token ${name} is missing or not a plain colour: ${tokens[name]}`);
    return c;
  };
  const checks: ContrastCheck[] = [];
  for (const s of SURFACES) for (const t of TEXT_TOKENS) checks.push({ pair: `${t} on ${s}`, ratio: contrastRatio(get(t), get(s)) });
  // The solid accent button, and the accent-tinted pill (active tab, pressed chip) over each panel surface.
  checks.push({ pair: "--accent-fg on --accent", ratio: contrastRatio(get("--accent-fg"), get("--accent")) });
  checks.push({ pair: "--accent-fg on --accent-strong", ratio: contrastRatio(get("--accent-fg"), get("--accent-strong")) });
  for (const s of ["--bg-panel", "--bg-panel-2", "--bg-elevated"] as const) {
    checks.push({ pair: `--accent on --accent-soft over ${s}`, ratio: contrastRatio(get("--accent"), over(get("--accent-soft"), get(s))) });
    checks.push({ pair: `--foreground on --accent-soft over ${s}`, ratio: contrastRatio(get("--foreground"), over(get("--accent-soft"), get(s))) });
  }
  return checks;
}
