import { describe, expect, it } from "vitest";
import { arrowMesh, arrowSpec } from "./arrow";

describe("arrowSpec", () => {
  it("reads faces, primes and doubles", () => {
    expect(arrowSpec("R")).toEqual({ normal: [1, 0, 0], prime: false, double: false, slice: false });
    expect(arrowSpec("U'")).toMatchObject({ normal: [0, 1, 0], prime: true, double: false });
    expect(arrowSpec("F2")).toMatchObject({ normal: [0, 0, 1], prime: false, double: true });
    expect(arrowSpec("B2'")).toMatchObject({ prime: true, double: true });
  });
  it("reads wide turns and slices (M follows L, E follows D, S follows F)", () => {
    expect(arrowSpec("Rw")).toMatchObject({ normal: [1, 0, 0], slice: false });
    expect(arrowSpec("r'")).toMatchObject({ normal: [1, 0, 0], prime: true });
    expect(arrowSpec("M")).toMatchObject({ normal: [-1, 0, 0], slice: true });
    expect(arrowSpec("E'")).toMatchObject({ normal: [0, -1, 0], slice: true, prime: true });
    expect(arrowSpec("S")).toMatchObject({ normal: [0, 0, 1], slice: true });
  });
  it("is null for rotations, empty and junk", () => {
    for (const t of ["x", "y'", "z2", "", null, undefined, "Q", "R3"]) expect(arrowSpec(t as string)).toBeNull();
  });
});

describe("arrowMesh", () => {
  it("is a valid triangle list in the z = 0 plane within the ring", () => {
    const m = arrowMesh(1, 0.2, 120);
    expect(m.positions.length % 3).toBe(0);
    expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
    for (let i = 2; i < m.positions.length; i += 3) expect(m.positions[i]).toBe(0);
    for (let i = 0; i < m.positions.length; i += 3) expect(Math.hypot(m.positions[i], m.positions[i + 1])).toBeLessThan(1.3);
  });
  it("a double turn spans further than a quarter", () => {
    const ang = (m: ReturnType<typeof arrowMesh>) => Math.atan2(m.positions[m.positions.length - 2], m.positions[m.positions.length - 3]);
    expect(ang(arrowMesh(1, 0.2, 250))).toBeLessThan(ang(arrowMesh(1, 0.2, 120)));
  });
});
