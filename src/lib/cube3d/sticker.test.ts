import { describe, expect, it } from "vitest";
import { PLATE_SPECS, buildPillow, roundedOutline, type PillowSpec } from "./sticker";

const all: [string, PillowSpec][] = Object.entries(PLATE_SPECS).flatMap(([k, v]) => [[`${k} fine`, v.fine as PillowSpec], [`${k} coarse`, v.coarse as PillowSpec]]);

describe("buildPillow", () => {
  it.each(all)("%s: indices are in range and no triangle faces away from +z (walls are vertical)", (_n, spec) => {
    const m = buildPillow(spec);
    const count = m.positions.length / 3;
    expect(m.indices.every((i) => i < count)).toBe(true);
    expect(m.uvs.length / 2).toBe(count);
    let up = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(nz).toBeGreaterThanOrEqual(-1e-12);
      if (nz > 1e-9) up++;
    }
    expect(up).toBeGreaterThan(m.outline);
  });
  it("the dome rises to edge + dome in the middle and is flat-ish at the rim", () => {
    const spec = PLATE_SPECS.dome.fine as PillowSpec;
    const m = buildPillow(spec);
    const z = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + 2]);
    expect(Math.max(...z)).toBeCloseTo(spec.edge + spec.dome, 5);
    expect(z[m.outline]).toBeCloseTo(spec.edge, 5);
    expect(z[0]).toBe(0);
  });
  it("the coarse build is lighter than the fine one, and the tile is flatter than the dome", () => {
    expect(buildPillow(PLATE_SPECS.dome.coarse).positions.length).toBeLessThan(buildPillow(PLATE_SPECS.dome.fine).positions.length);
    expect(PLATE_SPECS.tile.fine.dome).toBeLessThan(PLATE_SPECS.dome.fine.dome / 4);
  });
  it("the outline stays inside the plate and has very round corners", () => {
    const pts = roundedOutline(0.43, 0.27, 6);
    expect(Math.max(...pts.flat().map(Math.abs))).toBeLessThanOrEqual(0.43 + 1e-9);
    // the corner point is pulled well in from the square's corner
    expect(Math.hypot(...pts[3])).toBeLessThan(Math.hypot(0.43, 0.43) - 0.1);
  });
});
