import { FACELET_COLORS } from "@/lib/cube-engine/facelets";

/**
 * cubing.js draws its cube in its own saturated colours; the rest of the app (the Gyro Twin, the nets, the
 * case diagrams) uses FACELET_COLORS. These are the colours cubing.js paints with, as the raw 0..1 values it
 * puts on its three.js materials, so the player can be recoloured to the app's scheme (see recolorPlayer).
 */
/** The cubie body colour, the same as the Gyro Twin's (--twin-body in styles/twin.css). */
export const CUBE_BODY = "#0b0b0e";

const CUBING_RGB: Record<string, readonly [number, number, number]> = {
  U: [1, 1, 1],
  R: [1, 0, 0],
  F: [0, 1, 0],
  D: [1, 1, 0],
  L: [1, 0.6, 0],
  B: [0.133, 0.4, 1],
};

/** Which face colour a cubing.js material colour is, or null for anything else (the black body, hints, other stickerings). */
export function faceletForCubingColor(r: number, g: number, b: number): string | null {
  for (const [face, [fr, fg, fb]] of Object.entries(CUBING_RGB)) {
    if (Math.abs(r - fr) < 0.05 && Math.abs(g - fg) < 0.05 && Math.abs(b - fb) < 0.05) return face;
  }
  return null;
}

/** "#rrggbb" as raw 0..1 channels. */
export function hexToUnit(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface ThreeLike {
  traverse(cb: (o: { material?: unknown }) => void): void;
  scheduleRenderCallback?: () => void;
}
interface MaterialLike {
  opacity?: number;
  transparent?: boolean;
  needsUpdate?: boolean;
  color?: { r: number; g: number; b: number; setRGB?: (r: number, g: number, b: number) => unknown };
}

/**
 * Recolours a twisty-player's sticker materials to FACELET_COLORS, in place. Uses cubing.js's deprecated
 * `experimentalCurrentThreeJSPuzzleObject`, so every step is defensive: if the shape ever changes it does
 * nothing and the player simply keeps cubing.js's own colours.
 */
export async function recolorPlayer(player: { experimentalCurrentThreeJSPuzzleObject?: () => Promise<unknown> }): Promise<void> {
  try {
    const obj = (await player.experimentalCurrentThreeJSPuzzleObject?.()) as ThreeLike | undefined;
    if (!obj || typeof obj.traverse !== "function") return;
    const done = new Set<MaterialLike>();
    obj.traverse((o) => {
      for (const m of ([] as unknown[]).concat(o.material ?? []) as MaterialLike[]) {
        if (!m || done.has(m) || !m.color || typeof m.color.setRGB !== "function") continue;
        done.add(m);
        const face = faceletForCubingColor(m.color.r, m.color.g, m.color.b);
        if (face) m.color.setRGB(...hexToUnit(FACELET_COLORS[face]));
        else if (m.color.r === 0 && m.color.g === 0 && m.color.b === 0 && m.transparent) {
          // cubing.js draws the cubie bodies as a see-through black; the twin's are solid, so a pale page doesn't grey them.
          m.color.setRGB(...hexToUnit(CUBE_BODY));
          m.opacity = 1;
          m.transparent = false;
          m.needsUpdate = true;
        }
      }
    });
    obj.scheduleRenderCallback?.();
  } catch {
    // keep cubing.js's own colours
  }
}
