import { describe, expect, it } from "vitest";
import { markerSpan } from "./radarMarkers";

describe("markerSpan", () => {
  it("places a mistake where it happened, as wide as it cost", () => {
    expect(markerSpan(2_000, 1_000, 10_000)).toEqual({ left: 20, width: 10 });
  });

  it("gives an instant mistake a tappable minimum width", () => {
    expect(markerSpan(5_000, 0, 10_000).width).toBe(2);
  });

  it("keeps a late marker inside the track", () => {
    // Happened in the last moments: it used to start at 98% and be drawn 2%+ wide only by luck — never beyond 100.
    for (const [at, cost] of [[9_990, 5], [10_000, 400], [12_000, 50], [9_000, 9_000]]) {
      const { left, width } = markerSpan(at, cost, 10_000);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(98);
      expect(width).toBeGreaterThanOrEqual(2);
      expect(left + width).toBeLessThanOrEqual(100);
    }
    // A long cost is cut at the end of the track but starts where it happened.
    expect(markerSpan(9_000, 9_000, 10_000)).toEqual({ left: 90, width: 10 });
  });

  it("survives a zero or missing total and a negative start", () => {
    for (const total of [0, -5, Number.NaN]) {
      const { left, width } = markerSpan(1_000, 500, total);
      expect(left + width).toBeLessThanOrEqual(100);
      expect(Number.isFinite(left) && Number.isFinite(width)).toBe(true);
    }
    expect(markerSpan(-50, 100, 1_000).left).toBe(0);
  });
});
