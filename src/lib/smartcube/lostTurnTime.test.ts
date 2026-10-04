import { describe, expect, it } from "vitest";
import { lostTurnTimeMs, typicalTurnGapMs } from "./lostTurnTime";

describe("typicalTurnGapMs", () => {
  it("is the median of the recent gaps", () => {
    expect(typicalTurnGapMs([0, 100, 300, 400, 700])).toBe(150); // gaps 100, 200, 100, 300
  });

  it("shrugs off one long stall", () => {
    expect(typicalTurnGapMs([0, 150, 300, 450, 5450, 5600])).toBe(150);
  });

  it("only reads the latest gaps", () => {
    const slow = Array.from({ length: 20 }, (_, i) => i * 500);
    const last = slow[slow.length - 1];
    const fast = Array.from({ length: 8 }, (_, i) => last + (i + 1) * 120);
    expect(typicalTurnGapMs([...slow, ...fast])).toBe(120);
  });

  it("stays within sane bounds and has a default", () => {
    expect(typicalTurnGapMs([0, 10, 20, 30])).toBe(80);
    expect(typicalTurnGapMs([0, 3000, 6000])).toBe(600);
    expect(typicalTurnGapMs([])).toBe(250);
    expect(typicalTurnGapMs([1000])).toBe(250);
    expect(typicalTurnGapMs([500, 500, 500])).toBe(250); // simultaneous turns carry no spacing
  });
});

describe("lostTurnTimeMs", () => {
  it("adds one typical turn to the last recorded turn", () => {
    expect(lostTurnTimeMs([1000, 1200, 1400, 1600], 5000)).toBe(1800);
  });

  it("never lands later than the report that revealed it", () => {
    expect(lostTurnTimeMs([1000, 1200, 1400, 1600], 1650)).toBe(1650);
  });

  it("never lands before the last recorded turn", () => {
    expect(lostTurnTimeMs([1000, 1200, 1400, 1600], 1500)).toBe(1600);
  });

  it("falls back to the report time with no turns at all", () => {
    expect(lostTurnTimeMs([], 777)).toBe(777);
  });
});
