import { cubeFromAlg } from "./engine";

/**
 * Standard WCA/BOY color scheme, keyed by face letter. This is independent
 * of the solver's internal "cross lives on D" convention (see engine.ts) —
 * it's purely about how a physical cube's stickers are colored, for
 * visually verifying a scramble.
 */
export const FACELET_COLORS: Record<string, string> = {
  U: "#f5f5f0", // white
  R: "#e0332f", // red
  F: "#1fa64c", // green
  D: "#ffd42a", // yellow
  L: "#ff8c1a", // orange
  B: "#2f6bff", // blue
};

/**
 * Returns the 54-char facelet string (U0..U8,R0..R8,F0..F8,D0..D8,L0..L8,B0..B8,
 * each face read row-major as viewed head-on) for a solved cube with the
 * given scramble applied. Pure move application — no solver tables needed,
 * safe to call on the main thread.
 */
export function scrambleToFacelets(scramble: string): string {
  return cubeFromAlg(scramble).asString();
}
