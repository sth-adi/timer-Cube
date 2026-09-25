import { describe, expect, it } from "vitest";
import { buildPostSolveBaseline, paceFor, MIN_SOLVES } from "./postSolveBaseline";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";

function metric(segments: number[], id = "s"): SolveMetrics {
  return {
    id,
    date: 0,
    totalMs: segments.reduce((a, b) => a + b, 0),
    phases: [segments[0], segments[1] + segments[2] + segments[3] + segments[4], segments[5], segments[6]],
    segments,
    phaseEnds: [0, 0, 0, 0],
    pauses: [],
    turns: 40,
    tps: 4,
    execTps: 5,
    pauseMs: 0,
    pauseCount: 0,
    longestPauseMs: 0,
    f2lPauseMs: 0,
    rotations: null,
    crossOptimal: 8,
    freePairs: 0,
    ollSkip: false,
    pllSkip: false,
  };
}

// A steady solver: cross 2s, pairs 1.5/1.6/1.7/1.8s, OLL 2s, PLL 2s — every solve identical bar noise.
const BASE = [2000, 1500, 1600, 1700, 1800, 2000, 2000];

describe("Post-solve baseline", () => {
  it("needs a real sample before it says anything", () => {
    const few = Array.from({ length: MIN_SOLVES - 1 }, (_, i) => metric(BASE, `${i}`));
    expect(buildPostSolveBaseline(few)).toBeNull();
  });

  it("reads your own median and 25th percentile per segment, once there's enough", () => {
    const metrics = Array.from({ length: 20 }, (_, i) => metric(BASE.map((v) => v + (i % 5) * 40), `${i}`));
    const baseline = buildPostSolveBaseline(metrics)!;
    expect(baseline.segments).toHaveLength(7);
    expect(baseline.segments[0]!.medianMs).toBeGreaterThan(1900);
    expect(baseline.segments[0]!.medianMs).toBeLessThan(2100);
    expect(baseline.segments[0]!.goodMs).toBeLessThanOrEqual(baseline.segments[0]!.medianMs);
  });

  it("leaves a segment null if too many solves skipped it (e.g. OLL skips), even with plenty of solves overall", () => {
    const metrics = Array.from({ length: 20 }, (_, i) => metric(i < 16 ? [...BASE.slice(0, 5), 0, 2000] : BASE, `${i}`));
    const baseline = buildPostSolveBaseline(metrics)!;
    expect(baseline.segments[5]).toBeNull(); // only 4 real OLL samples, under MIN_SOLVES
    expect(baseline.segments[6]).not.toBeNull();
  });

  it("calls a solve fast, normal or slow against its own baseline", () => {
    // Cross ranges 1.5s-2.5s across solves so goodMs and medianMs actually differ.
    const metrics = Array.from({ length: 20 }, (_, i) => metric([1500 + i * 50, ...BASE.slice(1)], `${i}`));
    const baseline = buildPostSolveBaseline(metrics)!;
    const cross = baseline.segments[0]!;
    expect(cross.goodMs).toBeLessThan(cross.medianMs);
    expect(paceFor(cross.goodMs - 1, cross)).toBe("fast");
    expect(paceFor(cross.medianMs, cross)).toBe("normal");
    expect(paceFor(cross.medianMs * 2, cross)).toBe("slow");
    expect(paceFor(null, cross)).toBeNull();
    expect(paceFor(2000, null)).toBeNull();
  });
});
