import { describe, expect, it } from "vitest";
import { isStickerColor, smoothTrack, trackCube } from "./cubeTracker";

const W = 160;
const H = 120;
const STICKERS: [number, number, number][] = [
  [200, 30, 30],
  [255, 140, 20],
  [240, 220, 20],
  [30, 170, 70],
  [40, 90, 220],
];

/** A grey frame with a 3×3 grid of sticker-colored squares filling [x0,x0+s)×[y0,y0+s). */
function frame(x0: number, y0: number, s: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c: [number, number, number] = [120, 118, 115];
      if (x >= x0 && x < x0 + s && y >= y0 && y < y0 + s) {
        const cell = Math.floor(((x - x0) / s) * 3) + 3 * Math.floor(((y - y0) / s) * 3);
        // Thin black plastic between stickers.
        const gap = (x - x0) % (s / 3) < 2 || (y - y0) % (s / 3) < 2;
        c = gap ? [10, 10, 10] : STICKERS[cell % STICKERS.length];
      }
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("cube tracker", () => {
  it("classifies sticker colors and rejects grey, black and white", () => {
    for (const [r, g, b] of STICKERS) expect(isStickerColor(r, g, b)).toBe(true);
    expect(isStickerColor(120, 118, 115)).toBe(false);
    expect(isStickerColor(10, 10, 10)).toBe(false);
    expect(isStickerColor(245, 245, 245)).toBe(false);
  });

  it("finds a cube and its size wherever it is in the frame", () => {
    const r = trackCube(frame(90, 30, 48), W, H);
    expect(r.found).toBe(true);
    expect(r.cx).toBeCloseTo((90 + 24) / W, 1);
    expect(r.cy).toBeCloseTo((30 + 24) / H, 1);
    expect(r.size).toBeGreaterThan(0.25);
    expect(r.size).toBeLessThan(0.55);
  });

  it("ignores a flat colored backdrop — one hue filling the frame isn't a cube", () => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i + 1] = 150;
      px[i + 3] = 255;
    }
    expect(trackCube(px, W, H).found).toBe(false);
  });

  it("reports nothing on an empty frame", () => {
    expect(trackCube(frame(0, 0, 0), W, H).found).toBe(false);
  });

  it("smooths movement and keeps the last spot when the cube is lost", () => {
    const a = { found: true, cx: 0.2, cy: 0.2, w: 0.3, h: 0.4, size: 0.4, confidence: 0.1 };
    const b = { found: true, cx: 0.6, cy: 0.2, w: 0.3, h: 0.4, size: 0.4, confidence: 0.1 };
    expect(smoothTrack(a, b, 0.5).cx).toBeCloseTo(0.4);
    const lost = smoothTrack(a, { found: false, cx: 0.5, cy: 0.5, w: 0, h: 0, size: 0, confidence: 0 });
    expect(lost).toMatchObject({ found: false, cx: 0.2 });
  });
});
