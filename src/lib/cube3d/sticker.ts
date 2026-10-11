/**
 * The sticker plate as plain arrays (no three.js, so it is cheap to test): a rounded square with a short wall and a domed
 * top built from concentric rings, so the sticker is a soft pillow instead of a flat tile. Faces +z, base at z = 0, the
 * outline counter-clockwise seen from +z. Fewer rings and corner segments make the coarse version for the low tier.
 */

export interface PillowSpec {
  /** half the plate's width */
  half: number;
  /** corner radius */
  radius: number;
  /** points per corner arc, beyond the first */
  cornerSeg: number;
  /** height of the plate's rim above its base */
  edge: number;
  /** extra height at the middle: the dome */
  dome: number;
  /** ring scales from the rim (1) inward, each (0, 1], then the centre */
  rings: readonly number[];
}

export interface PillowMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  /** number of outline points per ring */
  outline: number;
}

/** The outline of a rounded square, counter-clockwise, starting at the bottom right corner. */
export function roundedOutline(half: number, radius: number, cornerSeg: number): [number, number][] {
  const c = half - radius;
  const corners: [number, number, number][] = [
    [c, -c, -Math.PI / 2],
    [c, c, 0],
    [-c, c, Math.PI / 2],
    [-c, -c, Math.PI],
  ];
  const pts: [number, number][] = [];
  for (const [cx, cy, a0] of corners)
    for (let k = 0; k <= cornerSeg; k++) {
      const a = a0 + ((Math.PI / 2) * k) / cornerSeg;
      pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
  return pts;
}

export function buildPillow(spec: PillowSpec): PillowMesh {
  const outline = roundedOutline(spec.half, spec.radius, spec.cornerSeg);
  const m = outline.length;
  const rings = spec.rings;
  const count = (rings.length + 1) * m + 1;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let v = 0;
  const put = (x: number, y: number, z: number) => {
    positions.set([x, y, z], v * 3);
    uvs.set([x / (2 * spec.half) + 0.5, y / (2 * spec.half) + 0.5], v * 2);
    v++;
  };
  for (const [x, y] of outline) put(x, y, 0);
  for (const s of rings) for (const [x, y] of outline) put(x * s, y * s, spec.edge + spec.dome * Math.sqrt(Math.max(0, 1 - s * s)));
  put(0, 0, spec.edge + spec.dome);
  const idx: number[] = [];
  const centre = count - 1;
  for (let j = 0; j < m; j++) {
    const j1 = (j + 1) % m;
    // wall, then each ring band, then the fan to the centre
    idx.push(j, j1, m + j1, j, m + j1, m + j);
    for (let k = 0; k < rings.length - 1; k++) {
      const a = (k + 1) * m;
      const b = (k + 2) * m;
      idx.push(a + j, a + j1, b + j1, a + j, b + j1, b + j);
    }
    idx.push(rings.length * m + j, rings.length * m + j1, centre);
  }
  return { positions, uvs, indices: Uint16Array.from(idx), outline: m };
}

/** The three plate shapes the looks use, each in a fine (desktop) and a coarse (low tier) build. */
export const PLATE_SPECS = {
  /** soft pillow with very round corners */
  dome: {
    fine: { half: 0.43, radius: 0.27, cornerSeg: 6, edge: 0.012, dome: 0.034, rings: [1, 0.965, 0.92, 0.85, 0.75, 0.6, 0.42, 0.2] },
    coarse: { half: 0.43, radius: 0.27, cornerSeg: 4, edge: 0.012, dome: 0.034, rings: [1, 0.94, 0.8, 0.55, 0.28] },
  },
  /** stickerless: nearly flush, fills the facelet */
  plate: {
    fine: { half: 0.455, radius: 0.2, cornerSeg: 6, edge: 0.01, dome: 0.012, rings: [1, 0.96, 0.85, 0.6, 0.3] },
    coarse: { half: 0.455, radius: 0.2, cornerSeg: 4, edge: 0.01, dome: 0.012, rings: [1, 0.9, 0.5] },
  },
  /** tiled: flat tile with a thin rounded rim, no dome */
  tile: {
    fine: { half: 0.43, radius: 0.1, cornerSeg: 4, edge: 0.02, dome: 0.006, rings: [1, 0.94, 0.5] },
    coarse: { half: 0.43, radius: 0.1, cornerSeg: 3, edge: 0.02, dome: 0.006, rings: [1, 0.94] },
  },
} as const satisfies Record<string, { fine: PillowSpec; coarse: PillowSpec }>;
