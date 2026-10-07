import { describe, expect, it } from "vitest";
import {
  CARD_FORMATS,
  barSegments,
  columns,
  contrast,
  ellipsize,
  ensureContrast,
  fitLine,
  fitSize,
  gridColumns,
  luminance,
  mix,
  parseCssColor,
  safeBox,
  seededRandom,
  sparkGeometry,
  wrapLines,
} from "./cardLayout";

/** A fake font: every glyph is `0.5 * px` wide. */
const widthAt = (text: string) => (px: number) => text.length * px * 0.5;

describe("formats and boxes", () => {
  it("has the two share sizes with margins that leave room", () => {
    expect(CARD_FORMATS.portrait).toMatchObject({ w: 1080, h: 1350 });
    expect(CARD_FORMATS.link).toMatchObject({ w: 1200, h: 630, scale: 2 });
    for (const f of Object.values(CARD_FORMATS)) {
      const b = safeBox(f);
      expect(b.x).toBe(f.marginX);
      expect(b.x + b.w).toBe(f.w - f.marginX);
      expect(b.y + b.h).toBe(f.h - f.marginY);
      expect(b.w).toBeGreaterThan(0);
    }
  });

  it("splits a box into equal columns with gaps", () => {
    const cols = columns({ x: 10, y: 0, w: 320, h: 50 }, 3, 10);
    expect(cols.map((c) => c.w)).toEqual([100, 100, 100]);
    expect(cols[2].x + cols[2].w).toBe(330);
  });

  it("never leaves a ragged stat grid", () => {
    expect(gridColumns(4, 4)).toBe(4);
    expect(gridColumns(1, 4)).toBe(1);
    expect(gridColumns(5, 4)).toBe(3);
    expect(gridColumns(0, 4)).toBe(1);
  });
});

describe("text fitting", () => {
  it("keeps the max size when the text already fits", () => {
    expect(fitSize(widthAt("12.34"), 500, 100, 20)).toBe(100);
  });

  it("shrinks until the text fits, never below the minimum", () => {
    const text = "A very long session name that cannot fit";
    const px = fitSize(widthAt(text), 600, 80, 20);
    expect(widthAt(text)(px)).toBeLessThanOrEqual(600);
    expect(px).toBeGreaterThanOrEqual(20);
    expect(widthAt(text)(px + 1)).toBeGreaterThan(600);
    expect(fitSize(widthAt(text), 10, 80, 20)).toBe(20);
  });

  it("ellipsizes to the width and leaves short text alone", () => {
    const m = (s: string) => widthAt(s)(20);
    expect(ellipsize("short", m, 500)).toBe("short");
    const out = ellipsize("An extraordinarily long username", m, 200);
    expect(out.endsWith("…")).toBe(true);
    expect(m(out)).toBeLessThanOrEqual(200);
    expect(ellipsize("anything", m, 5)).toBe("…");
  });

  it("fitLine shrinks first and only then cuts", () => {
    const measureAt = (s: string, px: number) => s.length * px * 0.5;
    expect(fitLine("hello world", measureAt, 150, 40, 20)).toEqual({ text: "hello world", px: 27 });
    const cut = fitLine("x".repeat(100), measureAt, 300, 40, 20);
    expect(cut.px).toBe(20);
    expect(measureAt(cut.text, cut.px)).toBeLessThanOrEqual(300);
    expect(cut.text.endsWith("…")).toBe(true);
  });

  it("wraps words and ellipsizes the last line when out of lines", () => {
    const m = (s: string) => widthAt(s)(10);
    const lines = wrapLines("one two three four five six seven eight nine ten", m, 100, 2);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(m(l)).toBeLessThanOrEqual(100);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(wrapLines("tiny", m, 100, 2)).toEqual(["tiny"]);
    expect(wrapLines("   ", m, 100, 2)).toEqual([]);
    const one = wrapLines("Supercalifragilisticexpialidocious", m, 100, 2);
    expect(m(one[0])).toBeLessThanOrEqual(100);
  });
});

describe("sparkline geometry", () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };

  it("puts the fastest time at the top and spreads x evenly", () => {
    const g = sparkGeometry([12000, 10000, 11000], box);
    expect(g.points.map((p) => p.x)).toEqual([0, 50, 100]);
    expect(g.points[1].y).toBe(0);
    expect(g.points[0].y).toBe(50);
    expect(g.bestIndex).toBe(1);
    expect(g.lastIndex).toBe(2);
  });

  it("breaks the line at a DNF instead of plotting a zero", () => {
    const g = sparkGeometry([10000, null, 12000, Infinity, 9000], box);
    expect(g.runs.map((r) => r.length)).toEqual([1, 1, 1]);
    expect(g.dnfs.map((d) => d.i)).toEqual([1, 3]);
    expect(g.bestIndex).toBe(4);
  });

  it("centres a lone point and a flat series", () => {
    const one = sparkGeometry([10000], box);
    expect(one.points[0]).toMatchObject({ x: 50, y: 25 });
    const flat = sparkGeometry([5000, 5000, 5000], box);
    expect(flat.points.every((p) => p.y === 25)).toBe(true);
  });

  it("copes with nothing but DNFs and with an empty series", () => {
    const dnf = sparkGeometry([null, null], box);
    expect(dnf.points).toEqual([]);
    expect(dnf.bestIndex).toBeNull();
    expect(dnf.dnfs).toHaveLength(2);
    expect(sparkGeometry([], box).lastIndex).toBeNull();
  });
});

describe("phase bar", () => {
  it("fills the width exactly, gaps included", () => {
    const segs = barSegments([{ label: "a", share: 1 }, { label: "b", share: 2 }, { label: "c", share: 1 }], 400, 8, 10);
    const last = segs[segs.length - 1];
    expect(last.x + last.w).toBeCloseTo(400, 5);
    expect(segs[1].w).toBeCloseTo(segs[0].w * 2, 5);
  });

  it("keeps a tiny phase visible by taking from the big ones", () => {
    const segs = barSegments([{ label: "a", share: 0.001 }, { label: "b", share: 0.999 }], 400, 8, 40);
    expect(segs[0].w).toBe(40);
    expect(segs[0].w + segs[1].w + 8).toBeCloseTo(400, 5);
  });

  it("handles zero shares and no parts", () => {
    expect(barSegments([], 100, 4, 10)).toEqual([]);
    const even = barSegments([{ label: "a", share: 0 }, { label: "b", share: 0 }], 104, 4, 10);
    expect(even[0].w).toBe(50);
  });
});

describe("colour", () => {
  it("parses hex and rgb forms and rejects the rest", () => {
    expect(parseCssColor("#7c5cff")?.rgb).toEqual([124, 92, 255]);
    expect(parseCssColor(" #fff ")?.rgb).toEqual([255, 255, 255]);
    expect(parseCssColor("rgba(124, 92, 255, 0.16)")).toEqual({ rgb: [124, 92, 255], a: 0.16 });
    expect(parseCssColor("rgb(1 2 3 / 50%)")).toEqual({ rgb: [1, 2, 3], a: 0.5 });
    expect(parseCssColor("#11223380")?.a).toBeCloseTo(0.502, 2);
    expect(parseCssColor("var(--accent)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });

  it("mixes linearly", () => {
    expect(mix([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
    expect(mix([0, 0, 0], [10, 10, 10], 5)).toEqual([10, 10, 10]);
  });

  it("rates contrast and nudges a weak colour until it reads", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
    const paper: [number, number, number] = [244, 245, 248];
    const pale: [number, number, number] = [220, 220, 160];
    expect(contrast(pale, paper)).toBeLessThan(3);
    expect(contrast(ensureContrast(pale, paper, 4.5), paper)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast([0, 0, 0], paper, 4.5)).toEqual([0, 0, 0]);
  });

  it("seeds the grain so every export is identical", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });
});
