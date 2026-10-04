import { describe, expect, it } from "vitest";
import { inspectionRemainingAt, inspectionRemainingFor, inspectionSecondsLeft, liveElapsedMs } from "./liveClockMath";

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

describe("inspection clock", () => {
  it("rounds the seconds left up and holds at the ends of the window", () => {
    expect(inspectionSecondsLeft(0)).toBe(15);
    expect(inspectionSecondsLeft(1)).toBe(15);
    expect(inspectionSecondsLeft(999)).toBe(15);
    expect(inspectionSecondsLeft(1000)).toBe(14);
    expect(inspectionSecondsLeft(14_999)).toBe(1);
    expect(inspectionSecondsLeft(15_000)).toBe(0);
    expect(inspectionSecondsLeft(16_500)).toBe(0);
    expect(inspectionSecondsLeft(-50)).toBe(15);
  });

  it("agrees with the exact value on every whole-second threshold the app uses", () => {
    for (let elapsed = 0; elapsed <= 17_000; elapsed += 37) {
      const exact = inspectionRemainingFor(elapsed);
      const whole = inspectionSecondsLeft(elapsed) * 1000;
      for (const mark of [7000, 3000, 0]) expect(whole <= mark).toBe(exact <= mark);
    }
  });

  it("follows the frame clock, and falls back before the first frame", () => {
    expect(inspectionRemainingAt(0, 1000, 15_000)).toBe(15_000);
    expect(inspectionRemainingAt(5000, null, 9000)).toBe(9000);
    expect(inspectionRemainingAt(6000, 1000, 15_000)).toBe(10_000);
    expect(inspectionRemainingAt(20_000, 1000, 15_000)).toBe(0);
  });
});
