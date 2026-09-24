import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { MIN_SOLVES, cadenceForSolve, cadenceReport, consistencyScore } from "./cadence";

function makeSolve(overrides: Partial<Solve>): Solve {
  return { id: "s1", sessionId: "sess1", timeMs: 10000, penalty: "none", scramble: "R U R' U'", date: 1, ...overrides };
}

/** `gaps` turned into a reconstruction + moveTimestamps of matching length (one extra leading move for the first, gap-less, turn). */
function timedFromGaps(gaps: number[]): { reconstruction: string; moveTimestamps: number[] } {
  const tokens = Array.from({ length: gaps.length + 1 }, () => "R");
  let t = 100;
  const times = [t];
  for (const g of gaps) {
    t += g;
    times.push(t);
  }
  return { reconstruction: tokens.join(" "), moveTimestamps: times };
}

describe("consistencyScore", () => {
  it("scores zero spread as perfect and rewards low variation", () => {
    expect(consistencyScore(150, 0)).toBe(100);
    expect(consistencyScore(150, 15)).toBeGreaterThan(80);
  });
  it("scores high spread near zero, and a zero mean as zero", () => {
    expect(consistencyScore(150, 300)).toBeLessThanOrEqual(10);
    expect(consistencyScore(0, 0)).toBe(0);
  });
});

describe("cadenceForSolve", () => {
  it("scores a metronome-even solve near 100", () => {
    const gaps = Array.from({ length: 20 }, () => 150);
    const c = cadenceForSolve(makeSolve(timedFromGaps(gaps)));
    expect(c).not.toBeNull();
    expect(c!.consistency).toBeGreaterThanOrEqual(95);
    expect(c!.meanGapMs).toBeCloseTo(150);
  });

  it("scores an alternating burst/stutter solve much lower than the even one", () => {
    const gaps = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 50 : 350));
    const c = cadenceForSolve(makeSolve(timedFromGaps(gaps)));
    expect(c).not.toBeNull();
    expect(c!.consistency).toBeLessThan(40);
  });

  it("excludes pauses to look (gaps at or past PAUSE_MS) from the gap sample", () => {
    const gaps = [...Array.from({ length: 15 }, () => 150), 5000, 5000];
    const c = cadenceForSolve(makeSolve(timedFromGaps(gaps)));
    expect(c!.gaps).toBe(15);
    expect(c!.meanGapMs).toBeCloseTo(150);
  });

  it("returns null without enough qualifying turns, on a DNF, or with mismatched lengths", () => {
    expect(cadenceForSolve(makeSolve(timedFromGaps(Array.from({ length: 5 }, () => 150))))).toBeNull();
    const even = timedFromGaps(Array.from({ length: 20 }, () => 150));
    expect(cadenceForSolve(makeSolve({ ...even, penalty: "dnf" }))).toBeNull();
    expect(cadenceForSolve(makeSolve({ reconstruction: "R U R'", moveTimestamps: [1, 2] }))).toBeNull();
    expect(cadenceForSolve(makeSolve({}))).toBeNull();
  });
});

describe("cadenceReport", () => {
  const steady = () => timedFromGaps(Array.from({ length: 20 }, () => 150));
  const choppy = () => timedFromGaps(Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 50 : 350)));

  it("returns null under MIN_SOLVES qualifying solves", () => {
    const solves = Array.from({ length: MIN_SOLVES - 1 }, (_, i) => makeSolve({ id: `s${i}`, date: i, ...steady() }));
    expect(cadenceReport(solves)).toBeNull();
  });

  it("aggregates consistency, orders solves oldest-first, and finds the best/worst", () => {
    const solves = [
      ...Array.from({ length: MIN_SOLVES }, (_, i) => makeSolve({ id: `steady${i}`, date: 100 + i, ...steady() })),
      makeSolve({ id: "worst", date: 5, ...choppy() }),
    ];
    const report = cadenceReport(solves)!;
    expect(report).not.toBeNull();
    expect(report.solves[0].id).toBe("worst"); // earliest date first
    expect(report.worst.id).toBe("worst");
    expect(report.best.consistency).toBeGreaterThan(report.worst.consistency);
    expect(report.avgConsistency).toBeGreaterThan(50);
    expect(report.headline).toMatch(/rhythm averages/);
  });
});
