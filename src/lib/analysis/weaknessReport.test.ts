import { describe, expect, it } from "vitest";
import { aggregateWeakness } from "./weaknessReport";
import type { PhaseAnalysis, SolveAnalysis } from "./analyze";

const emptyMetrics = { stm: 0, etm: 0, qtm: 0, rotations: 0 };

function phase(overrides: Partial<PhaseAnalysis>): PhaseAnalysis {
  return { phase: "cross", label: "Cross", moves: [], metrics: emptyMetrics, model: null, lost: null, ...overrides };
}

function analysis(phases: PhaseAnalysis[], cfopShaped = true): SolveAnalysis {
  return {
    ok: true,
    scramble: "",
    crossFace: "U",
    moves: [],
    metrics: emptyMetrics,
    phases,
    findings: [],
    modelStm: null,
    cfopShaped,
    summary: "",
  };
}

describe("aggregateWeakness", () => {
  it("sums lost moves per phase kind across solves, folding all F2L slots together", () => {
    const solves = [
      analysis([
        phase({ phase: "cross", label: "Cross", lost: 2 }),
        phase({ phase: "f2l", label: "F2L 1", slot: "FR", lost: 3 }),
        phase({ phase: "f2l", label: "F2L 2", slot: "FL", lost: 1 }),
      ]),
      analysis([phase({ phase: "cross", label: "Cross", lost: 1 })]),
    ];
    const report = aggregateWeakness(solves);
    const cross = report.phases.find((p) => p.label === "Cross")!;
    const f2l = report.phases.find((p) => p.label === "F2L")!;
    expect(cross.totalLost).toBe(3);
    expect(cross.occurrences).toBe(2);
    expect(f2l.totalLost).toBe(4);
    // Both F2L segments happened within one solve, so it counts as one
    // occurrence of "F2L costing time in this solve", not two.
    expect(f2l.occurrences).toBe(1);
  });

  it("ranks phases by total cost, worst first", () => {
    const solves = [
      analysis([
        phase({ phase: "oll", label: "OLL", lost: 8 }),
        phase({ phase: "pll", label: "PLL", lost: 2 }),
      ]),
    ];
    const report = aggregateWeakness(solves);
    expect(report.phases.map((p) => p.label)).toEqual(["OLL", "PLL"]);
  });

  it("aggregates by named case for OLL/PLL, ignoring skips", () => {
    const solves = [
      analysis([
        phase({ phase: "oll", label: "OLL", lost: 6, caseName: "T Shape 1" }),
        phase({ phase: "pll", label: "PLL", lost: 0, caseName: "PLL skip", skipped: true }),
      ]),
      analysis([phase({ phase: "oll", label: "OLL", lost: 4, caseName: "T Shape 1" })]),
      analysis([phase({ phase: "oll", label: "OLL", lost: 2, caseName: "Sune" })]),
    ];
    const report = aggregateWeakness(solves);
    expect(report.cases).toMatchObject([
      { label: "T Shape 1", totalLost: 10, occurrences: 2, avgLost: 5 },
      { label: "Sune", totalLost: 2, occurrences: 1, avgLost: 2 },
    ]);
  });

  it("ignores solves that weren't CFOP-shaped", () => {
    const solves = [analysis([phase({ lost: 10 })], false)];
    expect(aggregateWeakness(solves).phases).toEqual([]);
  });

  it("excludes zero-cost entries entirely rather than showing a 0", () => {
    const solves = [analysis([phase({ phase: "cross", label: "Cross", lost: 0 })])];
    expect(aggregateWeakness(solves).phases).toEqual([]);
  });

  it("reports analyzedCount as the number of analyses given", () => {
    const solves = [analysis([]), analysis([]), analysis([])];
    expect(aggregateWeakness(solves).analyzedCount).toBe(3);
  });

  describe("ranked by time, not moves", () => {
    // 4 cross moves turned at 100ms each, then an OLL that was recognised
    // slowly (a 1.2s pause) but executed in the fewest moves, and a PLL
    // with 3 extra moves turned quickly (80ms each).
    const moves = ["R", "U", "F", "D", "R", "U", "R'", "U'", "L", "B", "L'"];
    const timed = (): SolveAnalysis => ({
      ...analysis([
        phase({ phase: "cross", label: "Cross", moves: moves.slice(0, 4), lost: 0 }),
        phase({ phase: "oll", label: "OLL", moves: moves.slice(4, 8), lost: 0, caseName: "Sune" }),
        phase({ phase: "pll", label: "PLL", moves: moves.slice(8), lost: 3, caseName: "T Perm" }),
      ]),
      moves,
    });
    //                   R    U    F    D  | R     U     R'    U'  | L     B     L'
    const timestamps = [100, 200, 300, 400, 1600, 1700, 1800, 1900, 1980, 2060, 2140];

    it("a slow recognition outranks a few quickly-turned extra moves", () => {
      const report = aggregateWeakness([{ analysis: timed(), moveTimestamps: timestamps }]);
      expect(report.phases.map((p) => p.label)).toEqual(["OLL", "PLL"]);
      const oll = report.phases[0];
      expect(oll.pauseMs).toBe(1200);
      expect(oll.totalLost).toBe(0);
      const pll = report.phases[1];
      expect(pll.extraMoveMs).toBeCloseTo(3 * 80);
      expect(pll.pauseMs).toBe(0);
      expect(report.cases.map((c) => c.label)).toEqual(["Sune", "T Perm"]);
      expect(report.timedCount).toBe(1);
    });

    it("without per-move timing, prices extra moves at the solve's average pace and marks it estimated", () => {
      const a = { ...timed(), timeMs: 2200 };
      const report = aggregateWeakness([a]);
      expect(report.phases.map((p) => p.label)).toEqual(["PLL"]);
      expect(report.phases[0].extraMoveMs).toBeCloseTo((3 * 2200) / moves.length);
      expect(report.phases[0].estimated).toBe(1);
      expect(report.timedCount).toBe(0);
    });

    it("ignores timestamps that don't line up with the moves", () => {
      const report = aggregateWeakness([{ analysis: timed(), moveTimestamps: timestamps.slice(1) }]);
      expect(report.phases[0].estimated).toBe(1);
    });
  });
});
