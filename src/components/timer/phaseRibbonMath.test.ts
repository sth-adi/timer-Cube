import { describe, expect, it } from "vitest";
import { fillOffsetPct, isSlow, ribbonSegments, segmentFill, segmentState, SEGMENT_SPAN_RATIO } from "./phaseRibbonMath";

describe("ribbonSegments", () => {
  it("falls back to the default shape, with no ticks, when there is no history", () => {
    const segs = ribbonSegments([null, null, null, null]);
    expect(segs.every((s) => s.tickPct === null && s.slowAtMs === null)).toBe(true);
    expect(segs[1].spanMs).toBeGreaterThan(segs[0].spanMs);
  });

  it("ticks at the median, and the median sits inside the segment with room past it", () => {
    const [cross] = ribbonSegments([2000, 6000, 3000, 1000]);
    expect(cross.tickKind).toBe("median");
    expect(cross.tickPct).toBeCloseTo(100 / SEGMENT_SPAN_RATIO);
    expect(cross.slowAtMs).toBe(2600);
  });

  it("uses your best when there is no median, and never flags slow off it", () => {
    const [cross] = ribbonSegments([null, null, null, null], [1800, null, null, null]);
    expect(cross.tickKind).toBe("best");
    expect(cross.slowAtMs).toBeNull();
  });
});

describe("segmentFill / isSlow", () => {
  const [seg] = ribbonSegments([2000, 6000, 3000, 1000]);
  it("fills against the segment and caps at full", () => {
    expect(segmentFill(0, seg)).toBe(0);
    expect(segmentFill(seg.spanMs / 2, seg)).toBeCloseTo(50);
    expect(segmentFill(seg.spanMs * 3, seg)).toBe(100);
  });
  it("goes slow strictly past 1.3x the median", () => {
    expect(isSlow(2600, seg)).toBe(false);
    expect(isSlow(2601, seg)).toBe(true);
    expect(isSlow(null, seg)).toBe(false);
  });
});

describe("fillOffsetPct", () => {
  it("maps fill to a slide: full is 0, empty is -100", () => {
    expect(fillOffsetPct(100)).toBe(0);
    expect(fillOffsetPct(0)).toBe(-100);
    expect(fillOffsetPct(37.5)).toBe(-62.5);
  });

  it("clamps, ignores non-finite input and rounds to 0.05", () => {
    expect(fillOffsetPct(140)).toBe(0);
    expect(fillOffsetPct(-5)).toBe(-100);
    expect(fillOffsetPct(Number.NaN)).toBe(-100);
    expect(fillOffsetPct(50.012)).toBe(-50);
    expect(fillOffsetPct(50.04)).toBe(-49.95);
  });
});

describe("segmentState", () => {
  it("is done for a finished phase, current for the one being timed, pending after", () => {
    expect(segmentState(1200, 0, 1)).toBe("done");
    expect(segmentState(null, 1, 1)).toBe("current");
    expect(segmentState(null, 2, 1)).toBe("pending");
    expect(segmentState(null, 0, -1)).toBe("pending");
  });
});
