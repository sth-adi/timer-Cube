"use client";

import { useMemo } from "react";
import { scrambleToFacelets, FACELET_COLORS } from "@/lib/cube-engine/facelets";
import "@/styles/twin.css";
import { cn } from "@/lib/utils/cn";

// Classic unfolded cross net: U above F, D below F, L-F-R-B in a row.
// faceOrigin gives the (col, row) of each face's top-left sticker in a
// 12(col) x 9(row) grid; face letters index into the facelet string in
// blocks of 9 (U,R,F,D,L,B), each read row-major.
const FACE_BLOCK_START: Record<string, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const FACE_ORDER = Object.keys(FACE_BLOCK_START);
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

  // Like the Gyro Twin, each face is a black plate with rounded, softly glossed stickers inset in it
  // (see styles/twin.css), so the net and the 3D cube read as the same object.
  return (
    <div className={cn("net-grid", className)}>
      {FACE_ORDER.map((face) => (
        <div
          key={face}
          className="net-plate"
          style={{
            gridColumn: `${FACE_ORIGIN[face].col + 1} / span 3`,
            gridRow: `${FACE_ORIGIN[face].row + 1} / span 3`,
            opacity: dimFaces?.includes(face) ? 0.25 : 1,
          }}
        >
          {stickers
            .filter((s) => s.face === face)
            .map((s) => {
              const ringed = ringFacelets?.includes(s.index);
              return (
                <div
                  key={s.key}
                  className="net-sticker"
                  style={{
                    backgroundColor: s.color,
                    outline: ringed ? "2px solid var(--danger)" : undefined,
                    outlineOffset: 1,
                    zIndex: ringed ? 1 : undefined,
                  }}
                />
              );
            })}
        </div>
      ))}
    </div>
  );
}
