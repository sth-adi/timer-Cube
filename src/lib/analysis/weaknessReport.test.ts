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
    expect(report.cases).toEqual([
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
});
