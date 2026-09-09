import { describe, expect, it } from "vitest";
import { summarizeHeartRate } from "./heartRateStats";

describe("summarizeHeartRate", () => {
  it("is null when nothing falls in the window", () => {
    expect(summarizeHeartRate([], 1000)).toBeNull();
    expect(summarizeHeartRate([{ timestampMs: 500, bpm: 70 }], 1000)).toBeNull();
  });

  it("averages and maxes only the samples at or after startMs", () => {
    const samples = [
      { timestampMs: 0, bpm: 60 }, // before the window — excluded
      { timestampMs: 1000, bpm: 80 },
      { timestampMs: 2000, bpm: 100 },
      { timestampMs: 3000, bpm: 90 },
    ];
    const summary = summarizeHeartRate(samples, 1000)!;
    expect(summary.avg).toBe(90); // (80+100+90)/3
    expect(summary.max).toBe(100);
  });

  it("rounds the average to a whole bpm", () => {
    const samples = [
      { timestampMs: 0, bpm: 70 },
      { timestampMs: 1, bpm: 71 },
      { timestampMs: 2, bpm: 72 },
    ];
    expect(summarizeHeartRate(samples, 0)!.avg).toBe(71);
  });
});
