/**
 * How the 3D cube is dressed, chosen by the user in Settings and applied wherever the cube is drawn (live solve,
 * replay, calibration, reel). The renderer (scene.ts) turns it into materials; the settings store keeps the choice.
 */
export const STICKER_STYLES = ["bright", "pastel", "stickerless", "tiled"] as const;
export type StickerStyle = (typeof STICKER_STYLES)[number];

export const BODY_COLORS = ["black", "graphite", "white"] as const;
export type BodyColor = (typeof BODY_COLORS)[number];

export interface CubeLook {
  stickerStyle: StickerStyle;
  body: BodyColor;
}

export const DEFAULT_LOOK: CubeLook = { stickerStyle: "bright", body: "black" };

export const STICKER_STYLE_LABELS: Record<StickerStyle, string> = {
  bright: "Bright stickers",
  pastel: "Pastel stickers",
  stickerless: "Stickerless",
  tiled: "Tiled",
};

export const BODY_LABELS: Record<BodyColor, string> = { black: "Black", graphite: "Graphite", white: "White" };

/** A stored value that is not a known option falls back to the default instead of breaking the render. */
export function normalizeLook(raw: Partial<Record<keyof CubeLook, unknown>> | null | undefined): CubeLook {
  const style = STICKER_STYLES.find((s) => s === raw?.stickerStyle) ?? DEFAULT_LOOK.stickerStyle;
  const body = BODY_COLORS.find((b) => b === raw?.body) ?? DEFAULT_LOOK.body;
  return { stickerStyle: style, body };
}
