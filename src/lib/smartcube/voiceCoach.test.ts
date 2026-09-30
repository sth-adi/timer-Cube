import { describe, expect, it } from "vitest";
import { finishCallout, spokenTime, splitCallout } from "./voiceCoach";

describe("spokenTime", () => {
  it("floors to centiseconds like the on-screen clock", () => {
    expect(spokenTime(12345)).toBe("12.34");
    expect(spokenTime(12349)).toBe("12.34");
    expect(spokenTime(950)).toBe("0.95");
    expect(spokenTime(5000)).toBe("5.00");
  });
  it("speaks minutes out past 60 seconds", () => {
    expect(spokenTime(62340)).toBe("1 minute 2.34");
    expect(spokenTime(60000)).toBe("1 minute 0.00");
    expect(spokenTime(125000)).toBe("2 minutes 5.00");
  });
  it("never goes negative", () => {
    expect(spokenTime(-50)).toBe("0.00");
  });
});

describe("splitCallout", () => {
  const baseline = { medianMs: 2000, goodMs: 1500 };
  it("names the phase and its own duration", () => {
    expect(splitCallout({ phase: 0, durationMs: 1850, mode: "splits" })).toBe("Cross 1.85");
    expect(splitCallout({ phase: 2, durationMs: 1200, mode: "splits" })).toBe("O L L 1.20");
  });
  it("adds fast/slow only in full mode and only when it stands out", () => {
    expect(splitCallout({ phase: 0, durationMs: 1400, mode: "full", baseline })).toBe("Cross 1.40, fast");
    expect(splitCallout({ phase: 0, durationMs: 3000, mode: "full", baseline })).toBe("Cross 3.00, slow");
    expect(splitCallout({ phase: 0, durationMs: 1800, mode: "full", baseline })).toBe("Cross 1.80");
    expect(splitCallout({ phase: 0, durationMs: 1400, mode: "splits", baseline })).toBe("Cross 1.40");
  });
  it("says nothing extra without a baseline", () => {
    expect(splitCallout({ phase: 1, durationMs: 4000, mode: "full", baseline: null })).toBe("F 2 L 4.00");
  });
});

describe("finishCallout", () => {
  it("reads the time, with the PLL split ahead of it", () => {
    expect(finishCallout({ timeMs: 12340, penalty: "none", mode: "splits", pllMs: 1200 })).toBe("P L L 1.20. 12.34");
    expect(finishCallout({ timeMs: 12340, penalty: "none", mode: "splits" })).toBe("12.34");
  });
  it("calls a personal best only when it beats the best from before the solve", () => {
    expect(finishCallout({ timeMs: 9000, penalty: "none", mode: "full", priorBestMs: 9500 })).toBe("9.00. New personal best!");
    expect(finishCallout({ timeMs: 10000, penalty: "none", mode: "full", priorBestMs: 9500 })).toBe("10.00. 0.50 off your best");
    expect(finishCallout({ timeMs: 9500, penalty: "none", mode: "full", priorBestMs: 9500 })).toBe("9.50");
  });
  it("claims nothing with no history, or outside full mode", () => {
    expect(finishCallout({ timeMs: 9000, penalty: "none", mode: "full", priorBestMs: null })).toBe("9.00");
    expect(finishCallout({ timeMs: 9000, penalty: "none", mode: "splits", priorBestMs: 9500 })).toBe("9.00");
  });
  it("counts a +2 against the best, and never calls a PB on a DNF", () => {
    // 7.00 + 2 = 9.00 beats 9.50; 8.00 + 2 = 10.00 doesn't.
    expect(finishCallout({ timeMs: 7000, penalty: "plus2", mode: "full", priorBestMs: 9500 })).toBe("7.00 plus 2. New personal best!");
    expect(finishCallout({ timeMs: 8000, penalty: "plus2", mode: "full", priorBestMs: 9500 })).toBe("8.00 plus 2. 0.50 off your best");
    expect(finishCallout({ timeMs: 5000, penalty: "dnf", mode: "full", priorBestMs: 9500 })).toBe("D N F");
  });
});
