import { describe, expect, it } from "vitest";
import { liveElapsedMs } from "./liveClockMath";

describe("liveElapsedMs", () => {
  it("falls back to the last move until the first frame lands", () => {
    expect(liveElapsedMs(0, 1000, 1800)).toBe(800);
  });

  it("runs with the clock between moves", () => {
    expect(liveElapsedMs(3000, 1000, 1800)).toBe(2000);
  });

  it("never goes behind a move that landed after the frame's reading", () => {
    expect(liveElapsedMs(1900, 1000, 2000)).toBe(1000);
  });

  it("treats a missing start as zero", () => {
    expect(liveElapsedMs(500, null, 200)).toBe(500);
  });
});
