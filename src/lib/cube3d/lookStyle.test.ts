import { describe, expect, it } from "vitest";
import { BODY_COLORS, STICKER_STYLES } from "./look";
import { BODY_SPECS, STICKER_SPECS, pastelize, studioLight, styleColor } from "./lookStyle";

const sat = ([r, g, b]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);

describe("sticker styles", () => {
  it("pastel is lighter and less saturated, the others keep the colour", () => {
    const c: [number, number, number] = [0.8, 0.1, 0.1];
    const p = pastelize(c);
    expect(sat(p)).toBeLessThan(sat(c));
    expect(Math.min(...p)).toBeGreaterThan(Math.min(...c));
    expect(styleColor(c, "bright")).toEqual(c);
    expect(styleColor(c, "tiled")).toEqual(c);
    expect(styleColor(c, "pastel")).toEqual(p);
    expect(Math.max(...pastelize([1, 1, 1]))).toBeLessThanOrEqual(1);
  });
  it("has a spec for every style and body", () => {
    for (const s of STICKER_STYLES) expect(STICKER_SPECS[s].roughness).toBeGreaterThan(0);
    for (const b of BODY_COLORS) expect(BODY_SPECS[b].core).toMatch(/^#[0-9a-f]{6}$/);
    expect(STICKER_SPECS.stickerless.paintedBody).toBe(true);
    expect(STICKER_SPECS.tiled.plate).toBe("tile");
  });
});

describe("studioLight", () => {
  it("tints the key toward the accent, subtly, and stays bright", () => {
    const warm = studioLight("#e07a4f", "#130f0e");
    const cool = studioLight("#6f9be8", "#0c0e12");
    expect(warm.key[0] - warm.key[2]).toBeGreaterThan(cool.key[0] - cool.key[2]);
    for (const l of [warm, cool]) for (const c of [l.key, l.fill, l.rim]) for (const v of c) expect(v).toBeGreaterThan(0.75);
  });
  it("falls back to the neutral studio on a missing or odd value", () => {
    const n = studioLight(null);
    expect(studioLight("not a colour").key).toEqual(n.key);
    expect(n.key[0]).toBeGreaterThanOrEqual(n.key[2]);
  });
});
