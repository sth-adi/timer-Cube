"use client";

import { FACELET_COLORS } from "@/lib/cube-engine/facelets";

/**
 * An F2L case the way reference sheets draw it: the cube from above and to
 * the front-right, the slot being solved facing you, everything grey except
 * the pair's own stickers and the centres (so you can read which colours
 * they need to match). `facelets` is already turned so the case is in
 * front of you — see recognizeF2lCase.
 */

const GREY = "#3a3d46";
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
/**
 * A 3D point on the 3×3×3 cube (x right, y back, z up) projected
 * isometrically, seen from the front-right-top: the front face lands on the
 * left, the right face on the right, and the top face above both.
 */
const P = (x: number, y: number, z: number): [number, number] => [(x + y) * C30, (x - y) * S30 - z];

type Quad = [number, number, number][];

function quad(face: "U" | "F" | "R", r: number, c: number): Quad {
  if (face === "U") {
    // Row 0 is the back row; column 0 is the left.
    const y0 = 3 - r - 1;
    return [[c, y0 + 1, 3], [c + 1, y0 + 1, 3], [c + 1, y0, 3], [c, y0, 3]];
  }
  const z0 = 3 - r - 1;
  if (face === "F") return [[c, 0, z0 + 1], [c + 1, 0, z0 + 1], [c + 1, 0, z0], [c, 0, z0]];
  // R face: column 0 touches the front.
  return [[3, c, z0 + 1], [3, c + 1, z0 + 1], [3, c + 1, z0], [3, c, z0]];
}

const FACE_START = { U: 0, R: 9, F: 18 } as const;

export function F2lCaseIcon({ facelets, pairFacelets, className }: { facelets: string; pairFacelets: readonly number[]; className?: string }) {
  const coloured = new Set([...pairFacelets, 4, 13, 22]);
  const polys: { points: string; fill: string; key: string }[] = [];
  for (const face of ["U", "F", "R"] as const) {
    for (let i = 0; i < 9; i++) {
      const idx = FACE_START[face] + i;
      const pts = quad(face, Math.floor(i / 3), i % 3).map(([x, y, z]) => P(x, y, z));
      // Inset each sticker a touch toward its centre for the gaps between them.
      const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
      const cy = pts.reduce((a, p) => a + p[1], 0) / 4;
      const points = pts.map(([x, y]) => `${(cx + (x - cx) * 0.86).toFixed(3)},${(cy + (y - cy) * 0.86).toFixed(3)}`).join(" ");
      polys.push({ key: `${face}${i}`, points, fill: coloured.has(idx) ? FACELET_COLORS[facelets[idx]] ?? GREY : GREY });
    }
  }
  // Bounds of the projected cube: x ∈ [0, 6·C30], y ∈ [-4.5, 1.5].
  return (
    <svg viewBox={`-0.1 -4.6 ${6 * C30 + 0.2} 6.2`} className={className} role="img" aria-label="F2L case">
      <polygon
        points={[P(0, 0, 3), P(0, 3, 3), P(3, 3, 3), P(3, 3, 0), P(3, 0, 0), P(0, 0, 0)].map((p) => p.join(",")).join(" ")}
        fill="#15161b"
      />
      {polys.map((p) => (
        <polygon key={p.key} points={p.points} fill={p.fill} />
      ))}
    </svg>
  );
}
