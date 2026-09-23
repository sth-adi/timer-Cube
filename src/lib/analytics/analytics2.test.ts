import { describe, expect, it } from "vitest";
import type { SolveMetrics } from "./solveMetrics";
import { buildSumOfBest } from "./sumOfBest";
import { buildLuck } from "./luck";
import { buildArchetypes, kmeans } from "./archetypes";
import { BINS_PER_PHASE, buildStallMap, columnFor } from "./stallMap";

function make(i: number, o: Partial<{ phases: [number, number, number, number]; segs: number[]; cross: number; oll: boolean; pll: boolean; free: number; pauses: { atMs: number; ms: number }[] }> = {}): SolveMetrics {
  const phases = o.phases ?? [1500, 6000, 2000, 1500];
  const segs = o.segs ?? [phases[0], phases[1] / 4, phases[1] / 4, phases[1] / 4, phases[1] / 4, phases[2], phases[3]];
  const totalMs = phases.reduce((a, b) => a + b, 0);
  return {
    id: `s${i}`,
    date: 1_700_000_000_000 + i * 60_000,
    totalMs,
    phases,
    segments: segs,
    phaseEnds: [phases[0], phases[0] + phases[1], phases[0] + phases[1] + phases[2], totalMs],
    pauses: o.pauses ?? [],
    turns: 55,
    tps: 5,
    execTps: 8,
    pauseMs: (o.pauses ?? []).reduce((a, p) => a + p.ms, 0),
    pauseCount: (o.pauses ?? []).length,
    longestPauseMs: 0,
    f2lPauseMs: 0,
    rotations: null,
    crossOptimal: o.cross ?? 6,
    freePairs: o.free ?? 0,
    ollSkip: o.oll ?? false,
    pllSkip: o.pll ?? false,
  };
}

describe("buildSumOfBest", () => {
  it("adds up the best stretches and counts golds", () => {
    const solves = [
      make(0, { segs: [1000, 1500, 1500, 1500, 1500, 2000, 1500] }),
      make(1, { segs: [900, 1600, 1400, 1500, 1500, 2100, 1500] }),
      make(2, { segs: [1100, 1400, 1500, 1500, 1500, 1900, 1400] }),
      make(3, { segs: [1000, 1500, 1500, 1500, 1500, 0, 1500], oll: true }),
      make(4, { segs: [1000, 1500, 1500, 1500, 1200, 2000, 1500] }),
    ];
    const r = buildSumOfBest(solves)!;
    expect(r.segments.map((s) => s.bestMs)).toEqual([900, 1400, 1400, 1500, 1200, 1900, 1400]);
    expect(r.sumOfBestMs).toBe(9700);
    // The skipped OLL (0ms) doesn't count as a best by default...
    expect(r.segments[5].bestMs).toBe(1900);
    // ...but does when skips are allowed.
    expect(buildSumOfBest(solves, true)!.segments[5].bestMs).toBe(0);
    expect(r.goldsPerSolve).toEqual([0, 2, 3, 0, 1]);
    expect(r.lastGold!.label).toBe("Pair 4");
  });
});

describe("buildLuck", () => {
  it("prices each extra cross move and credits skips", () => {
    // Time = 10s + 400ms per cross move − 1.2s for a PLL skip, with a gentle learning trend.
    const solves = Array.from({ length: 60 }, (_, i) => {
      const cross = 4 + (i % 5);
      const pll = i % 9 === 0;
      const t = 10000 + 400 * (cross - 6) - (pll ? 1200 : 0) - 300 * Math.log(i + 1);
      return make(i, { phases: [1500, t - 5000, 2000, 1500], cross, pll });
    });
    const r = buildLuck(solves)!;
    expect(r.factors.find((f) => f.key === "cross")!.msPerUnit).toBeCloseTo(400, 3);
    expect(r.factors.every((f) => !f.unclear)).toBe(true);
    expect(r.factors.find((f) => f.key === "pll")!.msPerUnit).toBeCloseTo(-1200, 3);
    // OLL skips never happened, so they aren't in the model.
    expect(r.factors.find((f) => f.key === "oll")).toBeUndefined();
    const lucky = r.solves.find((s) => s.id === "s0")!; // cross 4 + PLL skip
    expect(lucky.luckMs).toBeLessThan(-1000);
    expect(lucky.earnedMs).toBeGreaterThan(lucky.totalMs);
  });
});

describe("archetypes", () => {
  it("k-means separates obvious groups", () => {
    const pts = [...Array.from({ length: 10 }, (_, i) => [0 + i * 0.01, 0]), ...Array.from({ length: 10 }, (_, i) => [5 + i * 0.01, 5])];
    const { assignment } = kmeans(pts, 2);
    expect(new Set(assignment.slice(0, 10)).size).toBe(1);
    expect(new Set(assignment.slice(10)).size).toBe(1);
    expect(assignment[0]).not.toBe(assignment[10]);
  });

  it("names the shapes", () => {
    const solves = Array.from({ length: 40 }, (_, i) => {
      if (i % 4 === 0) return make(i, { phases: [1500, 11000, 2000, 1500] }); // F2L grind
      if (i % 4 === 1) return make(i, { phases: [1500, 6000, 6000, 1500] }); // OLL stall
      if (i % 4 === 2) return make(i, { phases: [1500, 6000, 2000, 1500], pauses: [{ atMs: 3000, ms: 4000 }] }); // stop-start
      return make(i, { phases: [1400, 5500, 1800, 1400] }); // flow
    });
    const r = buildArchetypes(solves)!;
    const names = r.archetypes.map((a) => a.name).sort();
    expect(names).toEqual(["F2L grind", "Flow", "OLL stall", "Stop-start"]);
    expect(r.archetypes.find((a) => a.name === "Flow")!.blurb).toMatch(/less pausing/);
    expect(r.archetypes[0].name).toBe("Flow");
    expect(r.archetypes.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("archetypes — a dominant shape", () => {
  it("calls a big majority group Typical", () => {
    const solves = Array.from({ length: 40 }, (_, i) => {
      if (i % 10 === 0) return make(i, { phases: [1400, 5500, 1800, 1400] });
      if (i % 10 === 1) return make(i, { phases: [1500, 11000, 2000, 1500] });
      if (i % 10 === 2) return make(i, { phases: [1500, 6000, 6000, 1500] });
      return make(i, { phases: [1500 + (i % 3) * 10, 6000, 2000, 1500] });
    });
    const r = buildArchetypes(solves)!;
    expect(r.archetypes.some((a) => a.name === "Typical" && a.share >= 0.45)).toBe(true);
  });
});

describe("stall map", () => {
  it("drops each pause in its phase-relative column and finds the hotspot", () => {
    const m = make(0);
    expect(columnFor(m, 0)).toBe(0);
    expect(columnFor(m, 1500 + 10)).toBe(BINS_PER_PHASE); // just after the cross
    expect(columnFor(m, m.totalMs)).toBe(4 * BINS_PER_PHASE - 1);
    const solves = Array.from({ length: 12 }, (_, i) => make(i, { pauses: [{ atMs: 1550, ms: 800 }] }));
    const r = buildStallMap(solves)!;
    expect(r.columns[BINS_PER_PHASE]).toBe(800);
    expect(r.hotspots[0].where).toMatch(/right after the cross/);
    expect(r.byPhase[1]).toBe(800);
  });
});
