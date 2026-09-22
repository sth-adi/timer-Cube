"use client";

import { useMemo } from "react";
import { buildOllDiagram, buildPllDiagram, type DiagramArrow } from "@/lib/analysis/ollPllDiagram";
import { CORNER_FACELETS, EDGE_FACELETS } from "@/lib/cube-engine/facePositions";

/**
 * Community-standard OLL/PLL case diagram (the convention every reference
 * site — SpeedCubeDB, algdb, jperm.net — draws): the U face (top-down,
 * matching the algorithm library's own last-layer-on-U convention — see
 * ollData.ts) plus the single row of L/F/R/B stickers touching it.
 *
 * OLL reads as yellow-for-oriented / gray-for-unoriented, with the side
 * stickers always gray since permutation is irrelevant to OLL. PLL reads
 * real colors on the sides (a misplaced piece visibly shows the wrong
 * color) plus arrows tracing exactly which pieces cycle where — the actual
 * per-case logic lives in lib/analysis/ollPllDiagram.ts; this component is
 * just the SVG layout.
 */

const FACE_BLOCK_START: Record<string, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const FACE_ORIGIN: Record<string, { col: number; row: number }> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
};

const COLS = 12;
const ROWS = 4;
const CELL = 10;
const GAP = 1.2;
const UNIT = CELL + GAP;
const VB_W = COLS * UNIT - GAP;
const VB_H = ROWS * UNIT - GAP;

interface Sticker {
  key: string;
  color: string;
  col: number;
  row: number;
}

function buildStickers(facelets: Record<number, string>): Sticker[] {
  const stickers: Sticker[] = [];
  const uOrigin = FACE_ORIGIN.U;
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    stickers.push({ key: `U${i}`, color: facelets[i] ?? "#666", col: uOrigin.col + c, row: uOrigin.row + r });
  }
  for (const face of ["L", "F", "R", "B"] as const) {
    const start = FACE_BLOCK_START[face];
    const origin = FACE_ORIGIN[face];
    for (let c = 0; c < 3; c++) {
      stickers.push({ key: `${face}${c}`, color: facelets[start + c] ?? "#666", col: origin.col + c, row: origin.row });
    }
  }
  return stickers;
}

/** Pixel center of a U-face local index (0-8) within the SVG's coordinate space — every arrow endpoint lives here, since PLL only ever cycles pieces within the U layer. */
function uCellCenter(localIdx: number): { x: number; y: number } {
  const r = Math.floor(localIdx / 3);
  const c = localIdx % 3;
  const col = FACE_ORIGIN.U.col + c;
  const row = FACE_ORIGIN.U.row + r;
  return { x: col * UNIT + CELL / 2, y: row * UNIT + CELL / 2 };
}

/** Shrinks a line a little at both ends so it doesn't run straight through the sticker centers it connects — leaves room to actually see the arrowhead. */
function inset(from: { x: number; y: number }, to: { x: number; y: number }, by: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: from.x + ux * by,
    y1: from.y + uy * by,
    x2: to.x - ux * by,
    y2: to.y - uy * by,
  };
}

function ArrowLine({ arrow, cornerSlot, edgeSlot }: { arrow: DiagramArrow; cornerSlot: Record<number, number>; edgeSlot: Record<number, number> }) {
  const slotMap = arrow.kind === "corner" ? cornerSlot : edgeSlot;
  const from = uCellCenter(slotMap[arrow.from]);
  const to = uCellCenter(slotMap[arrow.to]);
  const { x1, y1, x2, y2 } = inset(from, to, CELL * 0.45);
  const markerId = arrow.kind === "corner" ? "arrowheadCorner" : "arrowheadEdge";
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#111"
        strokeWidth={1.1}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        markerStart={arrow.doubleHeaded ? `url(#${markerId})` : undefined}
      />
    </>
  );
}

interface CaseIconProps {
  /** The case's setup (e.g. `invertAlg(algCase.alg)`), applied on top of a solved cube. */
  setupAlg: string;
  kind: "OLL" | "PLL";
  className?: string;
}

export function CaseIcon({ setupAlg, kind, className }: CaseIconProps) {
  const diagram = useMemo(() => (kind === "OLL" ? buildOllDiagram(setupAlg) : buildPllDiagram(setupAlg)), [setupAlg, kind]);
  const stickers = useMemo(() => buildStickers(diagram.facelets), [diagram]);

  // Slot (0-3) -> U-local index (0-8), so arrows can find their endpoints without re-deriving the corner/edge layout.
  const cornerSlot = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(CORNER_FACELETS)) out[Number(k)] = v[0];
    return out;
  }, []);
  const edgeSlot = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(EDGE_FACELETS)) out[Number(k)] = v[0];
    return out;
  }, []);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className={className} role="img" aria-label={`${kind} case diagram`}>
      <defs>
        <marker id="arrowheadCorner" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill="#111" />
        </marker>
        <marker id="arrowheadEdge" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill="#111" />
        </marker>
      </defs>
      {stickers.map((s) => (
        <rect
          key={s.key}
          x={s.col * UNIT}
          y={s.row * UNIT}
          width={CELL}
          height={CELL}
          rx={1}
          fill={s.color}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.5}
        />
      ))}
      {diagram.arrows.map((a, i) => (
        <ArrowLine key={i} arrow={a} cornerSlot={cornerSlot} edgeSlot={edgeSlot} />
      ))}
    </svg>
  );
}
