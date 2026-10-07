import { describe, expect, it } from "vitest";
import { skeletonWidth } from "./skeletonWidths";

describe("skeletonWidth", () => {
  it("stays inside the range and is deterministic", () => {
    for (let i = -3; i < 30; i++) {
      const w = parseInt(skeletonWidth(i, 40, 90), 10);
      expect(w).toBeGreaterThanOrEqual(40);
      expect(w).toBeLessThanOrEqual(90);
      expect(skeletonWidth(i, 40, 90)).toBe(skeletonWidth(i, 40, 90));
    }
  });

  it("varies from bar to bar", () => {
    const widths = new Set(Array.from({ length: 8 }, (_, i) => skeletonWidth(i)));
    expect(widths.size).toBeGreaterThan(4);
  });

  it("tolerates swapped bounds", () => {
    expect(skeletonWidth(0, 90, 40)).toBe(skeletonWidth(0, 40, 90));
  });
});
