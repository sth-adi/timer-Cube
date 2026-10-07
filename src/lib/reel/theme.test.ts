import { describe, expect, it } from "vitest";
import { REEL_BG_BOTTOM, contrast, readableOn, withAlpha } from "./theme";

describe("reel theme", () => {
  it("leaves an accent that already reads on the dark card alone", () => {
    expect(readableOn("#7c5cff", REEL_BG_BOTTOM)).toBe("#7c5cff");
    expect(readableOn("#2dd4bf", REEL_BG_BOTTOM)).toBe("#2dd4bf");
  });

  it("lifts a dark accent (Paper's violet, an ink black) until it reads", () => {
    for (const dark of ["#5b3df5", "#14151c", "#4a2fdb"]) {
      const lifted = readableOn(dark, REEL_BG_BOTTOM);
      expect(contrast(lifted, REEL_BG_BOTTOM)).toBeGreaterThanOrEqual(3.5);
    }
    expect(readableOn("#5b3df5", REEL_BG_BOTTOM)).not.toBe("#5b3df5");
  });

  it("passes through anything that isn't a 6-digit hex, and builds rgba strings", () => {
    expect(readableOn("rebeccapurple", REEL_BG_BOTTOM)).toBe("rebeccapurple");
    expect(withAlpha("#ff8000", 0.5)).toBe("rgba(255,128,0,0.5)");
  });
});
