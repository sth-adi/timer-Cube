import { describe, expect, it } from "vitest";
import { attemptResult, neededForTarget, roundProgress, summarizeRound, wcaAverage } from "./round";

describe("WCA averages", () => {
  it("drops best and worst of five, rounding to hundredths", () => {
    expect(wcaAverage([10000, 12000, 11000, 9000, 15000], "ao5")).toBe(11000);
    expect(wcaAverage([10001, 10002, 10006, 9000, 15000], "ao5")).toBe(10000);
  });

  it("drops one DNF as the worst, but two DNFs make a DNF average", () => {
    expect(wcaAverage([10000, null, 11000, 12000, 13000], "ao5")).toBe(12000);
    expect(wcaAverage([10000, null, 11000, null, 13000], "ao5")).toBeNull();
  });

  it("means of three count every attempt", () => {
    expect(wcaAverage([30000, 33000, 36000], "mo3")).toBe(33000);
    expect(wcaAverage([30000, null, 36000], "mo3")).toBeNull();
    expect(wcaAverage([30000, 33000], "mo3")).toBeUndefined();
  });

  it("applies +2, DNF and the time limit to an attempt", () => {
    expect(attemptResult({ timeMs: 9000, penalty: "plus2" })).toBe(11000);
    expect(attemptResult({ timeMs: 9000, penalty: "dnf" })).toBeNull();
    expect(attemptResult({ timeMs: 61000, penalty: "none" }, { timeLimitMs: 60000 })).toBeNull();
  });
});

describe("round progress", () => {
  const fmt = { kind: "ao5" as const, cutoffMs: 20000, timeLimitMs: 60000 };
  it("ends the round after two attempts that miss the cutoff", () => {
    expect(roundProgress(fmt, [21000])).toMatchObject({ finished: false, missedCutoff: false, total: 5 });
    expect(roundProgress(fmt, [21000, null])).toMatchObject({ finished: true, missedCutoff: true, total: 2 });
    expect(roundProgress(fmt, [21000, 19000])).toMatchObject({ finished: false, missedCutoff: false, total: 5 });
  });

  it("summarizes against practice", () => {
    const s = summarizeRound(fmt, [12000, 13000, 12500, 11000, 14000], 12000);
    expect(s.average).toBe(12500);
    expect(s.compTaxMs).toBe(500);
    expect(s.headline).toMatch(/0\.50 slower than your practice average/);
    expect(summarizeRound(fmt, [21000, 25000], null).headline).toMatch(/Missed the 20\.00 cutoff — best single 21\.00/);
  });
});

describe("needed for a target", () => {
  it("finds the last-attempt time that reaches a target average", () => {
    // Counting is {11, x, 12}; x = 11.51 averages 11.503, which WCA rounds to 11.50.
    expect(neededForTarget([10000, 11000, 12000, 13000], 11500)).toBe(11510);
    expect(neededForTarget([10000, 11000, 12000, 13000], 10900)).toBe("impossible");
    expect(neededForTarget([10000, 10000, 10000, 10000], 11000)).toBe("locked");
  });
});
