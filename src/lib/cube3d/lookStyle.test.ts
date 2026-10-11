import { describe, expect, it } from "vitest";
import { BODY_COLORS, STICKER_STYLES } from "./look";
import { BODY_SPECS, STICKER_SPECS, SYMBOL_GLYPHS, WEAR_SPECS, glyphIndex, pastelize, studioLight, styleColor } from "./lookStyle";
import { DEFAULT_LOOK, normalizeLook, schemeColors } from "./look";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";

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

describe("wear and symbols", () => {
  it("wear grows from none to worn", () => {
    expect(WEAR_SPECS.none.tone + WEAR_SPECS.none.edge).toBe(0);
    expect(WEAR_SPECS.worn.tone).toBeGreaterThan(WEAR_SPECS.light.tone);
    expect(WEAR_SPECS.worn.edge).toBeGreaterThan(WEAR_SPECS.light.edge);
  });
  it("has one distinct glyph per face letter", () => {
    expect(new Set(SYMBOL_GLYPHS).size).toBe(6);
    expect(["U", "R", "F", "D", "L", "B"].map(glyphIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(glyphIndex("x")).toBe(-1);
  });
});

describe("normalizeLook", () => {
  it("accepts a look stored before the newer options existed", () => {
    expect(normalizeLook({ stickerStyle: "pastel", body: "white" })).toEqual({ ...DEFAULT_LOOK, stickerStyle: "pastel", body: "white" });
    expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
  });
  it("cleans up bad values", () => {
    const l = normalizeLook({ wear: "mud", scheme: "x", emblem: 3, symbols: "yes", customColors: ["#ABCDEF", "red", 5] });
    expect(l).toMatchObject({ wear: "none", scheme: "standard", emblem: "ring", symbols: false });
    expect(l.customColors).toEqual(["#abcdef", DEFAULT_LOOK.customColors[1], DEFAULT_LOOK.customColors[2], DEFAULT_LOOK.customColors[3], DEFAULT_LOOK.customColors[4], DEFAULT_LOOK.customColors[5]]);
  });
});

describe("schemeColors", () => {
  it("standard is the facelet colours; japanese swaps red and orange; custom uses the six colours", () => {
    expect(schemeColors(DEFAULT_LOOK, FACELET_COLORS)).toBe(FACELET_COLORS);
    const jp = schemeColors({ scheme: "japanese", customColors: DEFAULT_LOOK.customColors }, FACELET_COLORS);
    expect(jp.R).toBe(FACELET_COLORS.L);
    expect(jp.L).toBe(FACELET_COLORS.R);
    expect(jp.U).toBe(FACELET_COLORS.U);
    const c = schemeColors({ scheme: "custom", customColors: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"] }, FACELET_COLORS);
    expect([c.U, c.R, c.F, c.D, c.L, c.B]).toEqual(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
  });
});
