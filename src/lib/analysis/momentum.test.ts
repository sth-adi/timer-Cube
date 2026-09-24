import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { MIN_PAIRS, SITTING_GAP_MS, buildMomentum, relativeSittings, summarizeMomentum, type RelSolve } from "./momentum";

function makeSolve(id: string, date: number, timeMs: number, penalty: Solve["penalty"] = "none"): Solve {
  return { id, sessionId: "s", timeMs, penalty, scramble: "R U R' U'", date };
}

describe("relativeSittings", () => {
  it("splits solves into sittings on a gap of SITTING_GAP_MS or more", () => {
    let t = 0;
    const solves: Solve[] = [];
    for (let i = 0; i < 5; i++) {
      t += 10_000;
      solves.push(makeSolve(`a${i}`, t, 10_000));
    }
    t += SITTING_GAP_MS + 1000;
    for (let i = 0; i < 5; i++) {
      t += 10_000;
      solves.push(makeSolve(`b${i}`, t, 10_000));
    }
    const groups = relativeSittings(solves);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((s) => s.id)).toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect(groups[1].map((s) => s.id)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });

  it("drops sittings shorter than MIN_SITTING and excludes DNFs", () => {
    let t = 0;
    const solves: Solve[] = [makeSolve("lone", (t += 10_000), 10_000), makeSolve("dnf", (t += 10_000), 10_000, "dnf")];
    t += SITTING_GAP_MS + 1000;
    for (let i = 0; i < 6; i++) solves.push(makeSolve(`c${i}`, (t += 10_000), 10_000));
    const groups = relativeSittings(solves);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(6);
  });

  it("places each solve's time relative to its sitting's own median", () => {
    let t = 0;
    // Times: 8s, 10s, 10s, 10s, 12s — median 10s.
    const times = [8000, 10000, 10000, 10000, 12000];
    const solves = times.map((ms, i) => makeSolve(`s${i}`, (t += ms), ms));
    const [sitting] = relativeSittings(solves);
    expect(sitting[0].rel).toBeCloseTo(-0.2);
    expect(sitting[1].rel).toBeCloseTo(0);
    expect(sitting[4].rel).toBeCloseTo(0.2);
  });
});

describe("summarizeMomentum", () => {
  const sitting = (rels: number[]): RelSolve[] => rels.map((rel, i) => ({ id: `${i}`, date: i, rel }));

  it("returns null under MIN_PAIRS, or without at least 10 on each side", () => {
    // 20 pairs but all "after fast" (rel < 0 every time) — no "after slow" side.
    const allFast = sitting(Array.from({ length: 21 }, () => -0.1));
    expect(summarizeMomentum([allFast])).toBeNull();
    expect(summarizeMomentum([sitting(Array(10).fill(0))])).toBeNull();
  });

  it("finds genuine momentum: fast solves are followed by fast solves", () => {
    // Runs of fast solves (-0.1) alternating with runs of slow solves (+0.1)
    // — within a run, a fast solve is almost always followed by another fast
    // one (and likewise for slow), with only the rare run-boundary pair
    // crossing over. Repeated across several runs to clear MIN_PAIRS.
    const rels: number[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 15; i++) rels.push(-0.1);
      for (let i = 0; i < 15; i++) rels.push(0.1);
    }
    const report = summarizeMomentum([sitting(rels)])!;
    expect(report).not.toBeNull();
    expect(report.pairs).toBeGreaterThanOrEqual(MIN_PAIRS);
    expect(report.afterFastAvgRel).toBeLessThan(0);
    expect(report.afterSlowAvgRel).toBeGreaterThan(0);
    expect(report.hasMomentum).toBe(true);
    expect(report.headline).toMatch(/carry momentum/);
  });

  it("calls it independent when the gap is under the noise threshold", () => {
    // Every "next" solve is exactly at the sitting median (0), regardless of
    // whether the solve before it was fast or slow.
    const rels: number[] = [];
    for (let i = 0; i < 20; i++) rels.push(-0.1, 0, 0.1, 0);
    const report = summarizeMomentum([sitting(rels)])!;
    expect(report.hasMomentum).toBe(false);
    expect(report.headline).toMatch(/independent of the last/);
  });
});

describe("buildMomentum", () => {
  it("wires relativeSittings into summarizeMomentum end to end", () => {
    let t = 0;
    const solves: Solve[] = [];
    // Runs of 10 fast (9s) solves alternating with runs of 10 slow (11s)
    // solves, so most consecutive pairs stay on the same side of the median.
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 10; i++) solves.push(makeSolve(`f${cycle}-${i}`, (t += 9000), 9000));
      for (let i = 0; i < 10; i++) solves.push(makeSolve(`s${cycle}-${i}`, (t += 11000), 11000));
    }
    const report = buildMomentum(solves);
    expect(report).not.toBeNull();
    expect(report!.hasMomentum).toBe(true);
  });

  it("returns null with too little history", () => {
    expect(buildMomentum([makeSolve("only", 10_000, 10_000)])).toBeNull();
  });
});
