"use client";

import { useMemo } from "react";
import { scrambleToFacelets, FACELET_COLORS } from "@/lib/cube-engine/facelets";

/**
 * A genuine 3D corner view of the cube (U/F/R faces, via CSS 3D transforms)
 * rather than another flat unfolded net — deliberately different from
 * CaseIcon's OLL/PLL diagrams, since this shows *where a piece physically
 * is on the scrambled cube*, not an abstract last-layer pattern. Only
 * pieces whose highlighted facelets happen to fall on one of these 3 visible
 * faces can show a highlight at all — the same limitation a real photo of a
 * cube has, and for the same reason: you genuinely can't see the far side.
 */

const FACE_SIZE = 34;
const HALF = FACE_SIZE / 2;

const FACE_BLOCK_START: Record<"U" | "R" | "F", number> = { U: 0, R: 9, F: 18 };

interface StickerProps {
  color: string;
  highlighted: boolean;
}

function Sticker({ color, highlighted }: StickerProps) {
  return (
    <div
      style={{
        background: color,
        borderRadius: 1,
        opacity: highlighted ? 1 : 0.32,
        boxShadow: highlighted ? "0 0 0 1.5px var(--accent) inset" : undefined,
      }}
    />
  );
}

function Face({
  face,
  facelets,
  highlighted,
  transform,
}: {
  face: "U" | "R" | "F";
  facelets: string;
  highlighted: Set<number>;
  transform: string;
}) {
  const start = FACE_BLOCK_START[face];
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: FACE_SIZE,
        height: FACE_SIZE,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: 1,
        transformStyle: "preserve-3d",
        transform,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const globalIdx = start + i;
        return <Sticker key={i} color={FACELET_COLORS[facelets[globalIdx]] ?? "#666"} highlighted={highlighted.has(globalIdx)} />;
      })}
    </div>
  );
}

export function CubeLookaheadIcon({ scramble, highlighted, className }: { scramble: string; highlighted: Set<number>; className?: string }) {
  const facelets = useMemo(() => scrambleToFacelets(scramble), [scramble]);

  return (
    <div className={className} style={{ perspective: 260 }}>
      <div
        style={{
          width: FACE_SIZE,
          height: FACE_SIZE,
          position: "relative",
          margin: "0 auto",
          transformStyle: "preserve-3d",
          transform: "rotateX(-20deg) rotateY(-35deg)",
        }}
      >
        <Face face="U" facelets={facelets} highlighted={highlighted} transform={`rotateX(90deg) translateZ(${HALF}px)`} />
        <Face face="F" facelets={facelets} highlighted={highlighted} transform={`translateZ(${HALF}px)`} />
        <Face face="R" facelets={facelets} highlighted={highlighted} transform={`rotateY(90deg) translateZ(${HALF}px)`} />
      </div>
    </div>
  );
}
