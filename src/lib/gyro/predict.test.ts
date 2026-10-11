import { describe, expect, it } from "vitest";
import { predictOrientation } from "./predict";
import { quatAngleDeg } from "./smooth";
import type { Quat } from "./orientation";

function aboutY(deg: number): Quat {
  const h = (deg * Math.PI) / 360;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

describe("predictOrientation", () => {
  it("carries the rotation forward by the lead at the measured speed", () => {
    // 3 degrees in 50 ms = 60 deg/s; 50 ms ahead = 3 more degrees
    const out = predictOrientation({ q: aboutY(0), atMs: 0 }, { q: aboutY(3), atMs: 50 }, 60);
    expect(quatAngleDeg(out, aboutY(6))).toBeLessThan(0.01);
  });
  it("keeps the direction of the turn", () => {
    const out = predictOrientation({ q: aboutY(10), atMs: 0 }, { q: aboutY(7), atMs: 50 }, 60);
    expect(quatAngleDeg(out, aboutY(4))).toBeLessThan(0.01);
  });
  it("returns the newest sample with no history, when disabled, or when stale", () => {
    const last = { q: aboutY(5), atMs: 100 };
    expect(predictOrientation(null, last, 110)).toBe(last.q);
    expect(predictOrientation({ q: aboutY(0), atMs: 50 }, last, 110, false)).toBe(last.q);
    expect(predictOrientation({ q: aboutY(0), atMs: 50 }, last, 251)).toBe(last.q);
  });
  it("ignores samples too close together or too far apart", () => {
    expect(predictOrientation({ q: aboutY(0), atMs: 99 }, { q: aboutY(5), atMs: 100 }, 101).y).toBeCloseTo(aboutY(5).y, 9);
    expect(predictOrientation({ q: aboutY(0), atMs: 0 }, { q: aboutY(5), atMs: 500 }, 510).y).toBeCloseTo(aboutY(5).y, 9);
  });
  it("never aims further than the cap past the sample", () => {
    const out = predictOrientation({ q: aboutY(0), atMs: 0 }, { q: aboutY(60), atMs: 10 }, 12);
    expect(quatAngleDeg(out, aboutY(60))).toBeLessThanOrEqual(20.01);
    expect(quatAngleDeg(out, aboutY(60))).toBeGreaterThan(19.9);
  });
  it("does nothing when the cube is still", () => {
    const out = predictOrientation({ q: aboutY(5), atMs: 0 }, { q: aboutY(5), atMs: 50 }, 60);
    expect(quatAngleDeg(out, aboutY(5))).toBeLessThan(1e-6);
  });
});
