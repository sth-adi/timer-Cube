import { describe, expect, it } from "vitest";
import { computeDnaAxes } from "./dna";
import type { Solve } from "@/types";

function solve(timeMs: number, extra: Partial<Solve> = {}): Solve {
  return { id: Math.random().toString(), sessionId: "s", timeMs, penalty: "none", scramble: "", date: Date.now(), ...extra };
}

describe("computeDnaAxes", () => {
  it("falls back to just Volume (at 0) with no solves at all", () => {
    const axes = computeDnaAxes([]);
    expect(axes).toEqual([{ label: "Volume", score: 0 }]);
  });

  it("gives Speed and Consistency a perfect 100 when every solve is identical", () => {
    const solves = Array.from({ length: 5 }, () => solve(10_000));
    const axes = computeDnaAxes(solves);
    expect(axes.find((a) => a.label === "Speed")?.score).toBe(100);
    expect(axes.find((a) => a.label === "Consistency")?.score).toBe(100);
  });

  it("scores Speed below 100 when the mean trails the best", () => {
    // best=8000, mean=(8000+12000)/2=10000 -> 100*8000/10000=80
    const axes = computeDnaAxes([solve(8000), solve(12000)]);
    expect(axes.find((a) => a.label === "Speed")?.score).toBe(80);
  });

  it("adds one axis per phase, labeled from the same PHASE_LABELS the live timer uses", () => {
    // 4-phase splits (3 cumulative split marks -> Cross/F2L/OLL/PLL): solve A's
    // Cross phase (the first split) takes 1000ms, solve B's takes 3000ms ->
    // best=1000, mean=2000 -> 100*1000/2000=50.
    const solves = [
      solve(10_000, { splits: [1000, 5000, 8000] }),
      solve(12_000, { splits: [3000, 6000, 9000] }),
    ];
    const axes = computeDnaAxes(solves);
    const cross = axes.find((a) => a.label === "Cross");
    expect(cross?.score).toBe(50);
  });

  it("clamps every score into [0, 100]", () => {
    const axes = computeDnaAxes([solve(1000), solve(1_000_000)]);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
    }
  });
});
