/**
 * Finds a Rubik's cube in a camera frame by its stickers — no ML model,
 * no dependency, cheap enough to run every few frames on a phone. A
 * downscaled frame is split into a coarse grid; each cell scores the share
 * of its pixels that look like cube-sticker colors (strongly saturated and
 * bright — red, orange, yellow, green, blue); the densest cell seeds a
 * region that grows through neighbouring dense cells, and that region's
 * bounds are the cube. Orientation isn't read from the image at all — the
 * cube's own gyro supplies it — so this only has to answer "where, and
 * how big".
 */

export interface TrackResult {
  found: boolean;
  /** Centre and size as fractions of the frame (0-1). */
  cx: number;
  cy: number;
  /** Extent as a fraction of the frame's width and height respectively. */
  w: number;
  h: number;
  /** max(w, h) — a quick scale for when the frame's aspect doesn't matter. */
  size: number;
  /** Share of grid cells in the detected region — a rough confidence. */
  confidence: number;
}

const GRID_X = 16;
const GRID_Y = 12;
/** A cell counts as "cube" when this share of its pixels are sticker-colored. */
const CELL_THRESHOLD = 0.3;
/** Fewer cells than this in the region = not a cube, just something colorful. */
const MIN_CELLS = 3;
/** A region covering nearly the whole frame is a colored wall or backdrop, not a cube. */
const MAX_REGION_SHARE = 0.8;
/** A cube shows several sticker colors at once (three faces, or a scrambled face); one flat hue is something else. */
const MIN_HUES = 2;

/** Which sticker color a saturated pixel is: 0 red, 1 orange, 2 yellow, 3 green, 4 blue, 5 anything else. */
function hueBucket(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 5;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h < 15 || h >= 345 ? 0 : h < 40 ? 1 : h < 70 ? 2 : h < 170 ? 3 : h < 260 ? 4 : 5;
}

/** Saturated, reasonably bright, and not skin-toned-dull — the five colored sticker hues all pass; white doesn't need to. */
export function isStickerColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 90) return false;
  const sat = (max - min) / max;
  return sat > 0.5;
}

export function trackCube(rgba: Uint8ClampedArray, width: number, height: number): TrackResult {
  const cells = new Float32Array(GRID_X * GRID_Y);
  const counts = new Uint32Array(GRID_X * GRID_Y);
  const hues = new Uint32Array(GRID_X * GRID_Y * 6);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID_Y - 1, Math.floor((y / height) * GRID_Y));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(GRID_X - 1, Math.floor((x / width) * GRID_X));
      const i = (y * width + x) * 4;
      const c = gy * GRID_X + gx;
      counts[c]++;
      if (isStickerColor(rgba[i], rgba[i + 1], rgba[i + 2])) {
        cells[c]++;
        hues[c * 6 + hueBucket(rgba[i], rgba[i + 1], rgba[i + 2])]++;
      }
    }
  }
  for (let c = 0; c < cells.length; c++) cells[c] = counts[c] ? cells[c] / counts[c] : 0;

  let seed = -1;
  for (let c = 0; c < cells.length; c++) if (cells[c] >= CELL_THRESHOLD && (seed < 0 || cells[c] > cells[seed])) seed = c;
  const none: TrackResult = { found: false, cx: 0.5, cy: 0.5, w: 0, h: 0, size: 0, confidence: 0 };
  if (seed < 0) return none;

  // Grow the region from the densest cell through dense 8-neighbours (one gap allowed, for white stickers and black plastic between).
  const inRegion = new Uint8Array(cells.length);
  const queue = [seed];
  inRegion[seed] = 1;
  let minX = GRID_X;
  let maxX = -1;
  let minY = GRID_Y;
  let maxY = -1;
  let n = 0;
  const seen = new Set<number>();
  while (queue.length) {
    const c = queue.pop()!;
    let dominant = 0;
    for (let k = 1; k < 6; k++) if (hues[c * 6 + k] > hues[c * 6 + dominant]) dominant = k;
    if (dominant < 5) seen.add(dominant);
    const x = c % GRID_X;
    const y = Math.floor(c / GRID_X);
    n++;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_X || ny >= GRID_Y) continue;
        const nc = ny * GRID_X + nx;
        if (inRegion[nc] || cells[nc] < CELL_THRESHOLD) continue;
        inRegion[nc] = 1;
        queue.push(nc);
      }
    }
  }
  if (n < MIN_CELLS || n > MAX_REGION_SHARE * GRID_X * GRID_Y || seen.size < MIN_HUES) return none;
  const w = (maxX - minX + 1) / GRID_X;
  const h = (maxY - minY + 1) / GRID_Y;
  return {
    found: true,
    cx: (minX + maxX + 1) / 2 / GRID_X,
    cy: (minY + maxY + 1) / 2 / GRID_Y,
    w,
    h,
    size: Math.max(w, h),
    confidence: n / (GRID_X * GRID_Y),
  };
}

/** Exponential smoothing so the overlay glides instead of jittering frame to frame. */
export function smoothTrack(prev: TrackResult | null, next: TrackResult, alpha = 0.35): TrackResult {
  if (!next.found) return prev ? { ...prev, found: false } : next;
  if (!prev || !prev.found) return next;
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  return {
    found: true,
    cx: mix(prev.cx, next.cx),
    cy: mix(prev.cy, next.cy),
    w: mix(prev.w, next.w),
    h: mix(prev.h, next.h),
    size: mix(prev.size, next.size),
    confidence: next.confidence,
  };
}
