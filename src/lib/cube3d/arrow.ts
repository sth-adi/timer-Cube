/**
 * The "next move" arrow as plain numbers (no three.js): which way a token turns and the curved arrow that shows it,
 * a flat ring segment with an arrowhead drawn in the XY plane, clockwise seen from +z (a clockwise turn of a face seen from outside).
 */

export type Vec3 = readonly [number, number, number];

export interface ArrowSpec {
  /** outward normal of the face the arrow hovers over (the turning axis) */
  normal: Vec3;
  /** a prime turn runs the other way round */
  prime: boolean;
  double: boolean;
  /** a middle-layer turn: a small arrow over the centre of the face its direction follows */
  slice: boolean;
}

const NORMALS: Record<string, Vec3> = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
/** M turns like L, E like D, S like F. */
const SLICE_FACE: Record<string, string> = { M: "L", E: "D", S: "F" };

/** "R" "U'" "F2" "Rw" "r'" "M" "E2" → how to draw it; null for rotations (x y z), empty or unreadable tokens. */
export function arrowSpec(token: string | null | undefined): ArrowSpec | null {
  const m = /^([URFDLB]w?|[urfdlb]|[MES])(2'?|')?$/.exec((token ?? "").trim());
  if (!m) return null;
  const head = m[1][0];
  const slice = head in SLICE_FACE;
  const face = slice ? SLICE_FACE[head] : head.toUpperCase();
  return { normal: NORMALS[face], prime: m[2] === "'" || m[2] === "2'", double: !!m[2]?.startsWith("2"), slice };
}

export interface ArrowMesh {
  positions: number[];
  indices: number[];
}

/**
 * A ring-segment arrow: the band between `radius ± width/2` over `spanDeg`, starting at angle +span/2 and running clockwise
 * (decreasing angle) to a triangular head at the far end. Counter-clockwise turns mirror the mesh in x instead.
 */
export function arrowMesh(radius: number, width: number, spanDeg: number, steps = 20): ArrowMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const span = (spanDeg * Math.PI) / 180;
  const headLen = Math.min(0.5, span * 0.3);
  const bodySpan = span - headLen;
  const r0 = radius - width / 2;
  const r1 = radius + width / 2;
  for (let i = 0; i <= steps; i++) {
    const a = span / 2 - (bodySpan * i) / steps;
    positions.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const baseA = span / 2 - bodySpan;
  const base = positions.length / 3;
  const wide = width * 1.1;
  positions.push(Math.cos(baseA) * (radius - wide), Math.sin(baseA) * (radius - wide), 0);
  positions.push(Math.cos(baseA) * (radius + wide), Math.sin(baseA) * (radius + wide), 0);
  const tipA = baseA - headLen;
  positions.push(Math.cos(tipA) * radius, Math.sin(tipA) * radius, 0);
  indices.push(base, base + 1, base + 2);
  return { positions, indices };
}
