"use client";

import { useMemo } from "react";
import { scrambleToFacelets, FACELET_COLORS } from "@/lib/cube-engine/facelets";

// Classic unfolded cross net: U above F, D below F, L-F-R-B in a row.
// faceOrigin gives the (col, row) of each face's top-left sticker in a
// 12(col) x 9(row) grid; face letters index into the facelet string in
// blocks of 9 (U,R,F,D,L,B), each read row-major.
const FACE_BLOCK_START: Record<string, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const FACE_ORIGIN: Record<string, { col: number; row: number }> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
  D: { col: 3, row: 6 },
};

interface Sticker {
  key: string;
  face: string;
  index: number;
  color: string;
  col: number;
  row: number;
}

function buildStickers(facelets: string): Sticker[] {
  const stickers: Sticker[] = [];
  for (const face of Object.keys(FACE_BLOCK_START)) {
    const start = FACE_BLOCK_START[face];
    const origin = FACE_ORIGIN[face];
    for (let i = 0; i < 9; i++) {
      const letter = facelets[start + i];
      const r = Math.floor(i / 3);
      const c = i % 3;
      stickers.push({
        key: `${face}${i}`,
        face,
        index: start + i,
        color: FACELET_COLORS[letter] ?? "#666",
        col: origin.col + c,
        row: origin.row + r,
      });
    }
  }
  return stickers;
}

export function ScrambleNet({ scramble, className }: { scramble: string; className?: string }) {
  const facelets = useMemo(() => scrambleToFacelets(scramble), [scramble]);
  return <FaceletNet facelets={facelets} className={className} />;
}

/**
 * The same net drawn straight from a 54-char facelet string (e.g. a live or
 * recorded cube state). `dimFaces` fades whole faces (by face letter) and
 * `ringFacelets` outlines individual stickers (global 0-53 indices).
 */
export function FaceletNet({
  facelets,
  className,
  dimFaces,
  ringFacelets,
}: {
  facelets: string;
  className?: string;
  dimFaces?: readonly string[];
  ringFacelets?: readonly number[];
}) {
  const stickers = useMemo(() => buildStickers(facelets), [facelets]);

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridTemplateRows: "repeat(9, 1fr)",
        gap: "2px",
        aspectRatio: "12 / 9",
        maxWidth: 360,
        margin: "0 auto",
      }}
    >
      {stickers.map((s) => (
        <div
          key={s.key}
          style={{
            gridColumn: s.col + 1,
            gridRow: s.row + 1,
            background: s.color,
            borderRadius: 2,
            border: "1px solid rgba(0,0,0,0.35)",
            opacity: dimFaces?.includes(s.face) ? 0.25 : 1,
            outline: ringFacelets?.includes(s.index) ? "2px solid var(--danger)" : undefined,
            outlineOffset: 1,
            zIndex: ringFacelets?.includes(s.index) ? 1 : undefined,
          }}
        />
      ))}
    </div>
  );
}
