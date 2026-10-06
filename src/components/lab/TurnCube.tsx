"use client";

import { memo, useMemo } from "react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { STICKERS, turnGeometry, type TurnSpec, type Vec3 } from "@/lib/cube-engine/stickerTurns";

/** A turn part-way through: which one, and how far (0..1, linear — the cube eases it). */
export interface TurnState {
  turn: TurnSpec;
  progress: number;
}

const BODY = "#0b0b0e";
/** Fixed brightness per facing, baked into the sticker colour like a faint material difference — reads as depth from any angle. */
const SHADE: Record<string, number> = { "0,-1,0": 1.08, "1,0,0": 0.96, "0,0,1": 1, "0,1,0": 0.82, "-1,0,0": 0.9, "0,0,-1": 0.88 };

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

function Cubie({ info, facelets, s }: { info: CubieInfo; facelets: string; s: number }) {
  const h = s / 2;
  const [x, y, z] = info.cubie;
  const inset = Math.max(1.5, s * 0.07);
  return (
    <div
      className="absolute"
      style={{ left: (x + 1) * s, top: (y + 1) * s, width: s, height: s, transformStyle: "preserve-3d", transform: `translateZ(${z * s}px)` }}
    >
      {NORMALS.map((n) => {
        const nk = n.join(",");
        const idx = info.sticker[nk];
        return (
          <div
            key={nk}
            className="absolute left-0 top-0"
            style={{ width: s, height: s, background: BODY, borderRadius: s * 0.1, transform: FACE_TRANSFORM[nk](h), backfaceVisibility: "hidden" }}
          >
            {idx !== undefined && (
              <div
                className="absolute"
                style={{ inset, borderRadius: s * 0.1, background: shaded(FACELET_COLORS[facelets[idx]] ?? "#555555", SHADE[nk]) }}
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
 * `facelets` is the cube BEFORE `turning`; with no turn it is simply the cube. It draws in its own
 * `size` x `size` box, its centre at the box's centre, so the caller can tilt it as a whole.
 */
export const TurnCube = memo(function TurnCube({ facelets, turning, size }: { facelets: string; turning: TurnState | null; size: number }) {
  const s = size / 3;
  const geo = turning ? turnGeometry(turning.turn) : null;
  const turnKey = geo ? `${geo.axis}:${geo.layer}` : "";
  const { still, moving } = useMemo(() => {
    const still: React.ReactNode[] = [];
    const moving: React.ReactNode[] = [];
    for (const info of CUBIES) {
      const el = <Cubie key={info.key} info={info} facelets={facelets} s={s} />;
      if (geo && info.cubie[geo.axis] === geo.layer) moving.push(el);
      else still.push(el);
    }
    return { still, moving };
    // geo is a pure function of turnKey + the turn's amount, which only matters for the angle below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facelets, s, turnKey]);

  const angle = geo && turning ? geo.degrees * easeInOut(Math.max(0, Math.min(1, turning.progress))) : 0;
  const axisName = geo ? (["X", "Y", "Z"] as const)[geo.axis] : "Z";
  return (
    <div className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d" }}>
      {still}
      {geo && (
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotate${axisName}(${angle}deg)` }}>
          {moving}
        </div>
      )}
    </div>
  );
});
