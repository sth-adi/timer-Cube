import { describe, expect, it } from "vitest";
import { CUBE_HALF, cubePoints, fitDistance } from "./framing";

const base = { aspect: 1, fovDeg: 26, camYawDeg: 32, camPitchDeg: 24, lookY: -0.3, floorY: -1.95, floorMargin: 0.7, tiltDeg: 8, yawSpanDeg: 20, sweep: 0.8 };
/** the old fit: the 2.7 bounding sphere in the narrower dimension */
const sphere = (aspect: number) => {
  const half = (26 * Math.PI) / 360;
  const fit = aspect >= 1 ? half : Math.atan(Math.tan(half) * aspect);
  return (2.7 * 1.06) / Math.sin(fit);
};

describe("fitDistance", () => {
  it("sits closer than the bounding sphere fit, so the cube fills more of the frame", () => {
    expect(fitDistance(base)).toBeLessThan(sphere(1) * 0.93);
    expect(fitDistance({ ...base, aspect: 0.6 })).toBeLessThan(sphere(0.6) * 0.93);
  });
  it("backs off for a bigger tilt, a wider margin and a deeper floor", () => {
    expect(fitDistance({ ...base, tiltDeg: 30 })).toBeGreaterThan(fitDistance(base));
    expect(fitDistance({ ...base, margin: 1.2 })).toBeGreaterThan(fitDistance(base));
    expect(fitDistance({ ...base, floorMargin: 2 })).toBeGreaterThan(fitDistance(base));
  });
  it("a looser fit (any grip, full layer sweep) is about the old sphere fit", () => {
    const loose = fitDistance({ ...base, tiltDeg: 14, yawSpanDeg: 45, sweep: 1 });
    expect(loose).toBeGreaterThan(fitDistance(base));
    expect(loose).toBeGreaterThan(sphere(1) * 0.95);
  });
  it("is finite and positive for a wide and a tall canvas", () => {
    for (const aspect of [0.4, 1, 2.5]) {
      const d = fitDistance({ ...base, aspect });
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(5);
    }
  });
  it("lists the cube's corners and swept layer corners", () => {
    const pts = cubePoints();
    expect(pts.length).toBe(8 + 2 * 2 * 6);
    expect(Math.max(...pts.flat().map(Math.abs))).toBeCloseTo(CUBE_HALF * Math.SQRT2, 5);
  });
});
