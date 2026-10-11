/**
 * How the 3D cube is dressed, chosen by the user in Settings and applied wherever the cube is drawn (live solve,
 * replay, calibration, reel). The renderer (scene.ts) turns it into materials; the settings store keeps the choice.
 */
export const STICKER_STYLES = ["bright", "pastel", "stickerless", "tiled"] as const;
export type StickerStyle = (typeof STICKER_STYLES)[number];

export const BODY_COLORS = ["black", "graphite", "white"] as const;
export type BodyColor = (typeof BODY_COLORS)[number];

export const WEAR_LEVELS = ["none", "light", "worn"] as const;
export type Wear = (typeof WEAR_LEVELS)[number];

export const SCHEMES = ["standard", "japanese", "custom"] as const;
export type Scheme = (typeof SCHEMES)[number];

export const EMBLEMS = ["ring", "dot", "star", "none"] as const;
export type Emblem = (typeof EMBLEMS)[number];

/** The six faces in the order `customColors` lists them. */
export const SCHEME_FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type SchemeFace = (typeof SCHEME_FACES)[number];

export interface CubeLook {
  stickerStyle: StickerStyle;
  body: BodyColor;
  /** plastic and sticker variation: none, a little, or visibly used */
  wear: Wear;
  /** which colours the faces take; "custom" uses `customColors` */
  scheme: Scheme;
  /** six "#rrggbb" values in U R F D L B order, used by the custom scheme */
  customColors: readonly string[];
  /** the mark on the centre caps */
  emblem: Emblem;
  /** a small distinct glyph on each colour's stickers, for colour-blind solvers */
  symbols: boolean;
}

/** The custom scheme starts as the standard colours. */
export const DEFAULT_CUSTOM_COLORS: readonly string[] = ["#f5f5f0", "#e0332f", "#1fa64c", "#ffd42a", "#ff8c1a", "#2f6bff"];

export const DEFAULT_LOOK: CubeLook = { stickerStyle: "bright", body: "black", wear: "none", scheme: "standard", customColors: DEFAULT_CUSTOM_COLORS, emblem: "ring", symbols: false };

export const STICKER_STYLE_LABELS: Record<StickerStyle, string> = {
  bright: "Bright stickers",
  pastel: "Pastel stickers",
  stickerless: "Stickerless",
  tiled: "Tiled",
};

export const BODY_LABELS: Record<BodyColor, string> = { black: "Black", graphite: "Graphite", white: "White" };
export const WEAR_LABELS: Record<Wear, string> = { none: "New", light: "Light wear", worn: "Worn" };
export const SCHEME_LABELS: Record<Scheme, string> = { standard: "Standard", japanese: "Japanese", custom: "Custom" };
export const EMBLEM_LABELS: Record<Emblem, string> = { ring: "Ring", dot: "Dot", star: "Star", none: "None" };
export const SCHEME_FACE_LABELS: Record<SchemeFace, string> = { U: "Up", R: "Right", F: "Front", D: "Down", L: "Left", B: "Back" };

const HEX = /^#[0-9a-f]{6}$/i;

/** Six valid hex colours: bad or missing entries fall back to the standard colour for that face. */
export function normalizeCustomColors(raw: unknown): readonly string[] {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_CUSTOM_COLORS.map((d, i) => (typeof list[i] === "string" && HEX.test(list[i]) ? (list[i] as string).toLowerCase() : d));
}

/** A stored value that is not a known option falls back to the default instead of breaking the render. Looks saved before the newer options existed keep working. */
export function normalizeLook(raw: Partial<Record<keyof CubeLook, unknown>> | null | undefined): CubeLook {
  return {
    stickerStyle: STICKER_STYLES.find((s) => s === raw?.stickerStyle) ?? DEFAULT_LOOK.stickerStyle,
    body: BODY_COLORS.find((b) => b === raw?.body) ?? DEFAULT_LOOK.body,
    wear: WEAR_LEVELS.find((w) => w === raw?.wear) ?? DEFAULT_LOOK.wear,
    scheme: SCHEMES.find((s) => s === raw?.scheme) ?? DEFAULT_LOOK.scheme,
    customColors: normalizeCustomColors(raw?.customColors),
    emblem: EMBLEMS.find((e) => e === raw?.emblem) ?? DEFAULT_LOOK.emblem,
    symbols: raw?.symbols === true,
  };
}

/** Hex colour per face letter for a look (the face letters key the facelet string). */
export function schemeColors(look: Pick<CubeLook, "scheme" | "customColors">, standard: Record<string, string>): Record<string, string> {
  if (look.scheme === "custom") return Object.fromEntries(SCHEME_FACES.map((f, i) => [f, look.customColors[i] ?? standard[f]]));
  // Japanese scheme: the same pairs of opposite colours, with the red and orange sides swapped
  if (look.scheme === "japanese") return { ...standard, R: standard.L, L: standard.R };
  return standard;
}
