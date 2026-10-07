import { describe, expect, it } from "vitest";
import { cubeQuads, cubeSilhouette, cubeWidth, insetQuad, FACE_SHADE } from "./cardCube";

const area = (q: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
};

describe("isometric card cube", () => {
  const size = 120;
  const quads = cubeQuads(200, 100, size);

  it("has 27 stickers: nine on each of the three visible faces", () => {
    expect(quads).toHaveLength(27);
    for (const face of ["U", "F", "R"] as const) expect(quads.filter((q) => q.face === face)).toHaveLength(9);
  });

  it("maps each sticker to its facelet (U 0-8, R 9-17, F 18-26)", () => {
    const ids = quads.map((q) => q.facelet).sort((a, b) => a - b);
    expect(ids).toEqual([...Array(9).keys(), ...[...Array(9).keys()].map((i) => i + 9), ...[...Array(9).keys()].map((i) => i + 18)]);
    expect(quads.find((q) => q.face === "R" && q.cell === 0)!.facelet).toBe(9);
    expect(quads.find((q) => q.face === "F" && q.cell === 8)!.facelet).toBe(26);
  });

  it("is `size` tall and cos30-ish wide, centred where asked", () => {
    const xs = quads.flatMap((q) => q.quad.map((p) => p.x));
    const ys = quads.flatMap((q) => q.quad.map((p) => p.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(size, 5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(cubeWidth(size), 5);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(200, 5);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(100, 5);
  });

  it("gives every sticker of a face the same size, and the top the same as the sides' pairs", () => {
    for (const face of ["U", "F", "R"] as const) {
      const areas = quads.filter((q) => q.face === face).map((q) => area(q.quad));
      for (const a of areas) expect(a).toBeCloseTo(areas[0], 5);
    }
    // In a true isometric view all three faces are equally foreshortened.
    const u = area(quads.find((q) => q.face === "U")!.quad);
    const f = area(quads.find((q) => q.face === "F")!.quad);
    expect(u).toBeCloseTo(f, 5);
  });

  it("keeps the outline a hexagon that contains every sticker", () => {
    const hex = cubeSilhouette(200, 100, size);
    expect(hex).toHaveLength(6);
    const minY = Math.min(...hex.map((p) => p.y));
    const maxY = Math.max(...hex.map((p) => p.y));
    for (const q of quads) {
      for (const p of q.quad) {
        expect(p.y).toBeGreaterThanOrEqual(minY - 1e-9);
        expect(p.y).toBeLessThanOrEqual(maxY + 1e-9);
      }
    }
  });

  it("insets toward the middle", () => {
    const q = quads[0].quad;
    const small = insetQuad(q, 0.2);
    expect(area(small)).toBeCloseTo(area(q) * 0.64, 5);
    expect(insetQuad(q, 0)).toEqual(q);
  });

  it("lights the top brightest and the right side darkest", () => {
    expect(FACE_SHADE.U).toBeGreaterThan(FACE_SHADE.F);
    expect(FACE_SHADE.F).toBeGreaterThan(FACE_SHADE.R);
  });
});
