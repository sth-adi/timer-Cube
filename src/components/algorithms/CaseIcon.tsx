"use client";

import { useMemo } from "react";
import { scrambleToFacelets, FACELET_COLORS } from "@/lib/cube-engine/facelets";

/**
 * Compact last-layer diagram for an OLL/PLL case: the U face (top-down,
 * matching the algorithm library's own last-layer-on-U convention — see
 * ollData.ts) plus the single row of L/F/R/B stickers touching it, which is
 * enough to tell OLL cases apart by orientation and PLL cases apart by
 * permutation alike.
 *
 * Reuses ScrambleNet's own unfolded-net geometry (just cropped to the top
 * four rows) rather than re-deriving a "plus" layout by hand — the crop is
 * provably correct because the geometry it crops from already is.
 */

const FACE_BLOCK_START: Record<string, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const FACE_ORIGIN: Record<string, { col: number; row: number }> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
};

interface Sticker {
  key: string;
  color: string;
  col: number;
  row: number;
}

function buildIconStickers(facelets: string): Sticker[] {
  const stickers: Sticker[] = [];

  const uStart = FACE_BLOCK_START.U;
  const uOrigin = FACE_ORIGIN.U;
  for (let i = 0; i < 9; i++) {
    const letter = facelets[uStart + i];
    const r = Math.floor(i / 3);
    const c = i % 3;
    stickers.push({ key: `U${i}`, color: FACELET_COLORS[letter] ?? "#666", col: uOrigin.col + c, row: uOrigin.row + r });
  }

  for (const face of ["L", "F", "R", "B"] as const) {
    const start = FACE_BLOCK_START[face];
    const origin = FACE_ORIGIN[face];
    for (let c = 0; c < 3; c++) {
      // Row 0 of each face's own 3x3 block is its top row — the one touching U.
      const letter = facelets[start + c];
      stickers.push({ key: `${face}${c}`, color: FACELET_COLORS[letter] ?? "#666", col: origin.col + c, row: origin.row });
    }
  }

  return stickers;
}

/** `setupAlg` should be the case's setup (e.g. `invertAlg(algCase.alg)`), applied on top of a solved cube. */
export function CaseIcon({ setupAlg, className }: { setupAlg: string; className?: string }) {
  const stickers = useMemo(() => buildIconStickers(scrambleToFacelets(setupAlg)), [setupAlg]);

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridTemplateRows: "repeat(4, 1fr)",
        gap: "1.5px",
        aspectRatio: "12 / 4",
      }}
    >
      {stickers.map((s) => (
        <div
          key={s.key}
          style={{
            gridColumn: s.col + 1,
            gridRow: s.row + 1,
            background: s.color,
            borderRadius: 1,
            border: "1px solid rgba(0,0,0,0.35)",
          }}
        />
      ))}
    </div>
  );
}
