import { describe, expect, it } from "vitest";
import { shadowFromMatrix, shadowTransform, splitCamera } from "./groundShadow";

/** Column-major 4x4 for a turn of `deg` about an axis, as a CSS rotate gives it. */
function rot(axis: "x" | "y" | "z", deg: number): number[] {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (axis === "x") [m[5], m[6], m[9], m[10]] = [c, s, -s, c];
  if (axis === "y") [m[0], m[2], m[8], m[10]] = [c, -s, s, c];
  if (axis === "z") [m[0], m[1], m[4], m[5]] = [c, s, -s, c];
  return m;
}

describe("shadowFromMatrix", () => {
  const identity = rot("x", 0);
  it("leaves an upright, face-on cube's shadow where it is", () => {
    expect(shadowFromMatrix(identity, 80)).toEqual({ dx: 0, dy: 0, sx: 1, sy: 1 });
  });
  it("widens the shadow as the cube turns corner-first, and not past a limit", () => {
    const s = shadowFromMatrix(rot("y", 45), 80);
    expect(s.sx).toBeGreaterThan(1.1);
    expect(s.sy).toBeGreaterThan(1.1);
    expect(s.sx).toBeLessThanOrEqual(1.4);
    expect(s.dx).toBeCloseTo(0, 5);
  });
  it("leans toward the lowest face when the cube is tipped, one way or the other", () => {
    const right = shadowFromMatrix(rot("z", 30), 80);
    const left = shadowFromMatrix(rot("z", -30), 80);
    expect(Math.abs(right.dx)).toBeGreaterThan(3);
    expect(left.dx).toBeCloseTo(-right.dx, 5);
    const forward = shadowFromMatrix(rot("x", 30), 80);
    expect(Math.abs(forward.dy)).toBeGreaterThan(1);
    expect(forward.dx).toBeCloseTo(0, 5);
  });
  it("scales with the cube's size and is bounded for any pose", () => {
    expect(shadowFromMatrix(rot("z", 30), 160).dx).toBeCloseTo(2 * shadowFromMatrix(rot("z", 30), 80).dx, 5);
    for (let a = 0; a < 360; a += 15) {
      const s = shadowFromMatrix(rot("z", a), 80);
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(40);
      expect(s.sx).toBeLessThanOrEqual(1.4);
    }
  });
});

describe("splitCamera / shadowTransform", () => {
  it("takes the leading rotateX/rotateY as the camera and the rest as the grip", () => {
    expect(splitCamera("rotateX(-24deg) rotateY(32deg) matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)")).toEqual({
      camera: "rotateX(-24deg) rotateY(32deg) ",
      grip: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)",
    });
    expect(splitCamera("rotateZ(180deg)")).toEqual({ camera: "", grip: "rotateZ(180deg)" });
    expect(splitCamera("")).toEqual({ camera: "", grip: "" });
  });
  it("is the plain, unshifted ellipse when there is nothing to read", () => {
    expect(shadowTransform("", 80)).toBe("translate(0.0px, 0.0px) scale(1.000, 1.000)");
    expect(shadowTransform("rotateX(-24deg) rotateY(32deg)", 80)).toBe("translate(0.0px, 0.0px) scale(1.000, 1.000)");
  });
});
