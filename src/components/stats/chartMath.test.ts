import { describe, expect, it } from "vitest";
import { buildHeatGrid, clampReadout, formatAxisTime, nearestIndex, niceTicks, slotIndex, weeksThatFit } from "./chartMath";

describe("niceTicks", () => {
  it("steps on whole seconds inside the range", () => {
    const { ticks, stepMs } = niceTicks(7400, 21900, 4);
    expect(stepMs).toBe(5000);
    expect(ticks).toEqual([10000, 15000, 20000]);
  });
  it("uses sub-second steps for a tight range", () => {
    const { ticks, stepMs } = niceTicks(9100, 9900, 4);
    expect(stepMs).toBe(200);
    expect(ticks[0]).toBe(9200);
  });
  it("never returns a tick outside the range", () => {
    const { ticks } = niceTicks(8123, 14456, 4);
    expect(ticks.every((t) => t >= 8123 && t <= 14456)).toBe(true);
  });
});

describe("formatAxisTime", () => {
  it("formats seconds, tenths and minutes", () => {
    expect(formatAxisTime(10000, 1000)).toBe("10");
    expect(formatAxisTime(9200, 200)).toBe("9.2");
    expect(formatAxisTime(65000, 5000)).toBe("1:05");
  });
});

describe("pointer maths", () => {
  it("snaps to the nearest index and clamps", () => {
    expect(nearestIndex(0, 100, 11)).toBe(0);
    expect(nearestIndex(51, 100, 11)).toBe(5);
    expect(nearestIndex(500, 100, 11)).toBe(10);
    expect(nearestIndex(-20, 100, 11)).toBe(0);
    expect(nearestIndex(5, 100, 1)).toBe(0);
  });
  it("finds the slot under a pointer", () => {
    expect(slotIndex(0, 120, 12)).toBe(0);
    expect(slotIndex(119, 120, 12)).toBe(11);
    expect(slotIndex(500, 120, 12)).toBe(11);
  });
  it("keeps a readout inside the chart", () => {
    expect(clampReadout(5, 200, 340)).toBe(0);
    expect(clampReadout(335, 200, 340)).toBe(140);
    expect(clampReadout(170, 200, 340)).toBe(70);
  });
});

describe("buildHeatGrid", () => {
  const now = new Date(2026, 9, 6, 12).getTime(); // Tue 6 Oct 2026
  it("ends today on the right weekday row with the future blank", () => {
    const g = buildHeatGrid(now, 10);
    expect(g.columns).toHaveLength(10);
    const last = g.columns[9];
    expect(last[1]?.date).toBe("2026-10-06");
    expect(last[1]?.ago).toBe(0);
    expect(last[0]?.ago).toBe(1);
    expect(last[2]).toBeNull();
    expect(g.columns[0].every((c) => c !== null)).toBe(true);
  });
  it("pins month labels to the column holding the 1st, spaced apart", () => {
    const g = buildHeatGrid(now, 20);
    expect(g.months.some((m) => m.label === "Oct")).toBe(true);
    for (let i = 1; i < g.months.length; i++) expect(g.months[i].col - g.months[i - 1].col).toBeGreaterThanOrEqual(3);
  });
  it("fits a bounded number of weeks", () => {
    expect(weeksThatFit(336, 13, 3)).toBe(21);
    expect(weeksThatFit(50, 13, 3)).toBe(12);
    expect(weeksThatFit(2000, 13, 3)).toBe(30);
  });
});
