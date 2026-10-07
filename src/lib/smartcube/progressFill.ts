import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { STICKERS } from "@/lib/cube-engine/stickerTurns";

/**
 * The colour of a sticker that has not been put right yet (see cubeProgress): its own facelet colour, shaded
 * for its facing exactly like the 3D cube's stickers are, then pulled part-way to grey and darkened a touch,
 * so it reads as "not there yet" without turning into a different colour.
 */

/** TurnCube's per-facing brightness (by outward normal), repeated here because `stickerFills` bypasses it. */
const SHADE: Record<string, number> = { "0,-1,0": 1.08, "1,0,0": 0.96, "0,0,1": 1, "0,1,0": 0.82, "-1,0,0": 0.9, "0,0,-1": 0.88 };

/** How far toward grey (0..1) and how dark (multiplier) a pending sticker goes. */
export const PENDING_DESATURATE = 0.42;
export const PENDING_BRIGHTNESS = 0.82;

const cache = new Map<string, string>();

export function pendingColor(letter: string, normalKey: string): string {
  const key = letter + normalKey;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = parseInt((FACELET_COLORS[letter] ?? "#555555").slice(1), 16);
  const shade = SHADE[normalKey] ?? 1;
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v * shade);
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const out = rgb.map((v) => Math.max(0, Math.min(255, Math.round((v + (luma - v) * PENDING_DESATURATE) * PENDING_BRIGHTNESS))));
  const css = `rgb(${out[0]},${out[1]},${out[2]})`;
  cache.set(key, css);
  return css;
}

/** TurnCube's `stickerFills` for a pending list: the dimmed colour on pending stickers, undefined (own colour) on the rest. */
export function progressFills(facelets: string, pending: readonly boolean[]): (string | undefined)[] {
  return pending.map((p, i) => (p ? pendingColor(facelets[i], STICKERS[i].normal.join(",")) : undefined));
}
