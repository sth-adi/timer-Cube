"use client";

import { memo, useMemo } from "react";
import "@/styles/twin.css";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { STICKERS, moveGeometry, type MoveSpec, type Vec3 } from "@/lib/cube-engine/stickerTurns";

/**
 * A turn part-way through: which one, and how far (0..1, linear — the cube eases it). A face turn, a middle
 * slice (M E S), a whole-cube rotation (x y z) or the pair of opposite-face turns a real slice arrives as.
 */
export interface TurnState {
  turn: MoveSpec;
  progress: number;
}

/** Fixed brightness per facing, baked into the sticker colour: flat light-to-dark from the top face down to the bottom one, so the three faces in view always read as separate planes. */
const SHADE: Record<string, number> = { "0,-1,0": 1.1, "1,0,0": 0.94, "0,0,1": 1, "0,1,0": 0.76, "-1,0,0": 0.86, "0,0,-1": 0.84 };

const shadeCache = new Map<string, string>();
function shaded(hex: string, k: number): string {
  const key = hex + k;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

const FACE_TRANSFORM: Record<string, (h: number) => string> = {
  "0,0,1": (h) => `translateZ(${h}px)`,
  "0,0,-1": (h) => `rotateY(180deg) translateZ(${h}px)`,
  "1,0,0": (h) => `rotateY(90deg) translateZ(${h}px)`,
  "-1,0,0": (h) => `rotateY(-90deg) translateZ(${h}px)`,
  "0,-1,0": (h) => `rotateX(90deg) translateZ(${h}px)`,
  "0,1,0": (h) => `rotateX(-90deg) translateZ(${h}px)`,
};
const NORMALS: Vec3[] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
];

interface CubieInfo {
  key: string;
  cubie: Vec3;
  /** facelet index for each of the six normals ("x,y,z"), if that side carries a sticker */
  sticker: Record<string, number>;
}

/** The 26 outer cubies and which of their sides carry which facelet. */
const CUBIES: CubieInfo[] = (() => {
  const map = new Map<string, CubieInfo>();
  STICKERS.forEach((s, i) => {
    const key = s.cubie.join(",");
    const info = map.get(key) ?? { key, cubie: s.cubie, sticker: {} };
    info.sticker[s.normal.join(",")] = i;
    map.set(key, info);
  });
  // Cubies with no sticker still need their body drawn: the hidden corner-free ones (none on a 3x3 beyond the core) are skipped.
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const key = [x, y, z].join(",");
        if (!map.has(key) && !(x === 0 && y === 0 && z === 0)) map.set(key, { key, cubie: [x, y, z], sticker: {} });
      }
  return [...map.values()];
})();

function Cubie({ info, facelets, s, lit, fills }: { info: CubieInfo; facelets: string; s: number; lit: boolean; fills?: readonly (string | undefined)[] }) {
  const h = s / 2;
  const [x, y, z] = info.cubie;
  // The gap between neighbouring stickers is two insets: thin, but always at least a pixel of body showing at the smallest twin.
  const inset = Math.max(1.4, s * 0.062);
  const radius = Math.max(1.5, s * 0.15);
  return (
    <div
      className={lit ? "tc-lit absolute" : "absolute"}
      style={{ left: (x + 1) * s, top: (y + 1) * s, width: s, height: s, transformStyle: "preserve-3d", transform: `translateZ(${z * s}px)` }}
    >
      {NORMALS.map((n) => {
        const nk = n.join(",");
        const idx = info.sticker[nk];
        return (
          <div
            key={nk}
            className="tc-face absolute left-0 top-0"
            style={{ width: s, height: s, borderRadius: s * 0.12, transform: FACE_TRANSFORM[nk](h), backfaceVisibility: "hidden" }}
          >
            {idx !== undefined && (
              <div
                className="tc-sticker absolute"
                style={{ inset, borderRadius: radius, backgroundColor: fills?.[idx] ?? shaded(FACELET_COLORS[facelets[idx]] ?? "#555555", SHADE[nk]) }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * A 3x3 drawn as 26 cubies in CSS 3D, so a face turn is a real layer turning — nine cubies swinging
 * round together, the seams between them showing — rather than stickers changing colour in place.
 * Middle slices (M E S) turn just the middle layer, whole-cube rotations (x y z) all three, and a slice-shaped
 * pair of opposite-face turns (R' with L, as a real cube reports an M) swings both outer layers as one turn.
 * `facelets` is the cube BEFORE `turning`; with no turn it is simply the cube. It draws in its own
 * `size` x `size` box, its centre at the box's centre, so the caller can tilt it as a whole.
 * `stickerFills` (optional, 54 entries in facelet order) paints a sticker with that CSS colour instead of its
 * facelet colour, as is (no per-facing shading), so a data colour keeps the exact value it was given; an
 * undefined entry keeps the facelet colour. Callers should keep the array's identity stable between renders.
 */
export const TurnCube = memo(function TurnCube({
  facelets,
  turning,
  size,
  stickerFills,
}: {
  facelets: string;
  turning: TurnState | null;
  size: number;
  stickerFills?: readonly (string | undefined)[];
}) {
  const s = size / 3;
  const geo = turning ? moveGeometry(turning.turn) : null;
  // Which layers swing round together (a pair's late half is a part of its own), as the one thing the cubies' grouping depends on.
  const turnKey = geo ? `${geo.axis}:${geo.parts.map((p) => p.layers.join(",")).join("|")}` : "";
  const { still, moving } = useMemo(() => {
    const still: React.ReactNode[] = [];
    const moving: React.ReactNode[][] = geo ? geo.parts.map(() => []) : [];
    for (const info of CUBIES) {
      const part = geo ? geo.parts.findIndex((p) => (p.layers as readonly number[]).includes(info.cubie[geo.axis])) : -1;
      // A whole-cube rotation turns every cubie: highlighting all of them would just outline the cube, so only a partial turn lights up.
      const lit = part >= 0 && geo!.parts[part].layers.length < 3;
      const el = <Cubie key={info.key} info={info} facelets={facelets} s={s} lit={lit} fills={stickerFills} />;
      if (part >= 0) moving[part].push(el);
      else still.push(el);
    }
    return { still, moving };
    // geo is a pure function of turnKey + the turn's amount, which only matters for the angle below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facelets, s, turnKey, stickerFills]);

  const progress = turning ? Math.max(0, Math.min(1, turning.progress)) : 0;
  const axisName = geo ? (["X", "Y", "Z"] as const)[geo.axis] : "Z";
  return (
    <div className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d" }}>
      {still}
      {geo?.parts.map((part, i) => {
        // A part that set off late (lag) covers its whole turn in what is left of the move, so both end together.
        const own = part.lag > 0 ? Math.max(0, (progress - part.lag) / (1 - part.lag)) : progress;
        return (
          <div key={i} className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotate${axisName}(${part.degrees * easeInOut(own)}deg)` }}>
            {moving[i]}
          </div>
        );
      })}
    </div>
  );
});
