import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { COLD_WINDOW, MIN_SAMPLES, analyzeColdStart, classifyGaps, summarizeColdStart, type GapClassification } from "./coldStart";

function timesFromGaps(gaps: number[]): number[] {
  const times = [0];
  for (const g of gaps) times.push(times[times.length - 1] + g);
  return times;
}

/** One token per timestamp — gaps.length + 1 tokens for gaps.length gaps. */
function tokensFor(gaps: number[]): string[] {
  return Array.from({ length: gaps.length + 1 }, (_, i) => `M${i}`);
}

describe("classifyGaps", () => {
  it("marks the COLD_WINDOW gaps right after a pause as cold, everything else warm", () => {
    // gap1 warm, gap2 is the pause (excluded), gap3-4 cold (window of 2 so far)...
    const gaps = [100, 500, 90, 95, 600, 110, 105];
    const tokens = tokensFor(gaps);
    const timesMs = timesFromGaps(gaps);
    const { cold, warm } = classifyGaps(tokens, timesMs);
    expect(warm).toEqual([100]);
    // A second pause arrives mid-window (after only 2 of 3 cold slots were
    // used) and resets the window rather than back-filling the interrupted
    // slot as warm.
    expect(cold).toEqual([90, 95, 110, 105]);
  });

  it("doesn't overrun the move list when a pause lands near the end", () => {
    const gaps = [500, 80]; // pause, then only one turning gap left
    const tokens = tokensFor(gaps);
    const { cold, warm } = classifyGaps(tokens, timesFromGaps(gaps));
    expect(cold).toEqual([80]);
    expect(warm).toEqual([]);
  });

  it("stays warm for a solve with no pauses at all", () => {
    const gaps = [100, 120, 90, 110];
    const tokens = tokensFor(gaps);
    const { cold, warm } = classifyGaps(tokens, timesFromGaps(gaps));
    expect(cold).toEqual([]);
    expect(warm).toEqual(gaps);
  });

  it("returns empty on mismatched lengths", () => {
    expect(classifyGaps(["R"], [0, 100])).toEqual({ cold: [], warm: [] });
  });
});

describe("summarizeColdStart", () => {
  const rows = (cold: number[], warm: number[]): GapClassification[] => [{ cold, warm }];

  it("returns null under MIN_SAMPLES on either side", () => {
    expect(summarizeColdStart(rows(Array(MIN_SAMPLES).fill(100), Array(MIN_SAMPLES - 1).fill(80)))).toBeNull();
  });

  it("flags a real cold-start tax", () => {
    const report = summarizeColdStart(rows(Array(MIN_SAMPLES).fill(140), Array(MIN_SAMPLES).fill(100)))!;
    expect(report).not.toBeNull();
    expect(report.taxMs).toBeCloseTo(40);
    expect(report.hasColdStart).toBe(true);
    expect(report.headline).toMatch(/real cold-start tax/);
  });

  it("calls it noise when the gap is small", () => {
    const report = summarizeColdStart(rows(Array(MIN_SAMPLES).fill(105), Array(MIN_SAMPLES).fill(100)))!;
    expect(report.hasColdStart).toBe(false);
    expect(report.headline).toMatch(/no real cold start/);
  });
});

describe("analyzeColdStart", () => {
  function makeSolve(id: string, gaps: number[]): Solve {
    const times = timesFromGaps(gaps);
    const faces = ["R", "U", "R'", "U'", "F", "F'"];
    const tokens = Array.from({ length: gaps.length + 1 }, (_, i) => faces[i % faces.length]);
    return { id, sessionId: "s", timeMs: times[times.length - 1], penalty: "none", scramble: "R U R' U'", date: 1, reconstruction: tokens.join(" "), moveTimestamps: times };
  }

  it("pools cold/warm gaps across many solves and finds a real tax", () => {
    // Each solve: one pause followed by COLD_WINDOW slow turns, then a run of fast warm turns.
    const solves: Solve[] = [];
    for (let i = 0; i < 15; i++) {
      const gaps = [500, 140, 140, 140, ...Array(10).fill(90)];
      solves.push(makeSolve(`s${i}`, gaps));
    }
    const report = analyzeColdStart(solves)!;
    expect(report).not.toBeNull();
    expect(report.coldSamples).toBe(15 * COLD_WINDOW);
    expect(report.hasColdStart).toBe(true);
  });

  it("returns null with too little history", () => {
    expect(analyzeColdStart([makeSolve("only", [500, 100, 100])])).toBeNull();
  });
});
