import { describe, expect, it } from "vitest";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import type { AlgSpeedReport, AlgSpeed } from "./algSpeed";
import type { F2lConsistencyReport } from "./f2lConsistency";
import { MIN_SOLVES, buildCoach } from "./labCoach";

const metrics = (n: number, f2lPause: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ totalMs: 20_000, phases: [3000, 10_000, 4000, 3000], f2lPauseMs: f2lPause(i) }) as unknown as SolveMetrics);

const alg = (over: Partial<AlgSpeed>): AlgSpeed => ({
  group: "OLL",
  name: "Dot 2",
  count: 5,
  medianTps: 8,
  medianTurns: 22,
  bookTurns: 11,
  medianExecMs: 3000,
  medianPauseMs: 900,
  savableMs: 1600,
  lostMsPerSolve: 400,
  verdict: "two-look",
  ...over,
});

describe("buildCoach", () => {
  it("returns null under MIN_SOLVES", () => {
    expect(buildCoach({ metrics: metrics(MIN_SOLVES - 1, () => 0), habits: [], f2l: null, alg: null, look: null })).toBeNull();
  });

  it("ranks findings by seconds per solve and drops ones too small to practise for", () => {
    const algReport = { flagged: [alg({}), alg({ name: "Ga Perm", group: "PLL", verdict: "slow-hands", lostMsPerSolve: 30 })] } as unknown as AlgSpeedReport;
    const f2l = { worst: [{ name: "Piece stuck in another slot", bestTurns: 7, medianTurns: 10 }], lostMsPerSolve: 250 } as unknown as F2lConsistencyReport;
    const r = buildCoach({ metrics: metrics(40, (i) => i * 100), habits: [], f2l, alg: algReport, look: null })!;
    const ids = r.findings.map((f) => f.id);
    // F2L pause gap: median(0..3900) − p25 = 975ms; two-look 400; f2l cases 250; slow-hands 30 is dropped.
    expect(ids).toEqual(["f2l-pauses", "two-look", "f2l-cases"]);
    expect(r.findings[0].msPerSolve).toBeCloseTo(975);
    expect(r.headline).toMatch(/Your biggest lever: pause less between F2L pairs — about 0\.9[78]s a solve/);
    expect(r.goal).not.toBeNull();
  });

  it("leaves look mistakes to the alg finding so the same time isn't counted twice", () => {
    const habits = [
      { kind: "extra-oll-look" as const, label: "Extra OLL look", solvesAffected: 30, occurrences: 30, totalCostMs: 60_000, costPerSolveMs: 1500 },
      { kind: "wasted-turns" as const, label: "Wasted turns", solvesAffected: 10, occurrences: 12, totalCostMs: 8000, costPerSolveMs: 200 },
    ];
    const r = buildCoach({ metrics: metrics(40, () => 0), habits, f2l: null, alg: null, look: null })!;
    expect(r.findings.map((f) => f.id)).toEqual(["mistake-wasted-turns"]);
  });
});
