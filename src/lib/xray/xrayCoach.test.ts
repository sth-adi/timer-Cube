import { describe, expect, it } from "vitest";
import type { SolveXray } from "./solveXray";
import type { F2lFlowReport, PairDecision } from "./f2lFlow";
import type { AlgExecution } from "./algMicroscope";
import type { OracleReport } from "./lastSlotOracle";
import { buildXrayFindings, mergeFindings } from "./xrayCoach";

/** A pair decision taking 10 turns over 2s — 200ms a turn. */
const decision = (regret: number): PairDecision => ({
  pair: 0,
  label: "Green-Red",
  startIndex: 0,
  endIndex: 10,
  startMs: 0,
  endMs: 2000,
  movesUsed: 10,
  chosenDistance: 7 + regret,
  easiestPair: 1,
  easiestDistance: 7,
  regret,
  sideEffects: [],
});

const flow = (regrets: number[], scatter = 0): F2lFlowReport => ({
  points: [],
  decisions: regrets.map(decision),
  freePairs: [],
  easiestPickRate: regrets.filter((r) => r === 0).length / regrets.length,
  setupGained: 0,
  scatter,
  flowScore: 50,
});

const exec = (caseName: string, gaps: number[], recognitionMs = 800): AlgExecution => ({
  step: "PLL",
  caseName,
  alg: "R U R' U'",
  tokens: ["R", "U", "R'", "U'"],
  recognitionMs,
  executionMs: gaps.reduce((a, b) => a + b, 0),
  gaps,
  date: 0,
  oneLook: true,
  clean: true,
  mergedAlg: "R U R' U'",
});

const xr = (partial: Partial<SolveXray>): SolveXray => ({ flow: null, oracle: null, executions: [], neutrality: null, ...partial });

describe("buildXrayFindings", () => {
  it("prices pair-choice regret against your better quarter, at your own F2L turn speed", () => {
    // Regret per solve: 0,0,0,4,4,4,4,4 → median 4, q25 0 → 4 turns × 200ms.
    const results = [0, 0, 0, 4, 4, 4, 4, 4].map((r) => xr({ flow: flow([r, 0, 0]) }));
    const f = buildXrayFindings(results).find((x) => x.id === "xray-pair-choice")!;
    expect(f.msPerSolve).toBeCloseTo(4 * 200);
  });

  it("finds nothing when every solve is equally clean", () => {
    expect(buildXrayFindings(Array.from({ length: 8 }, () => xr({ flow: flow([0, 0, 0]) })))).toEqual([]);
  });

  it("pins a stall to its exact turn and prices it per solve", () => {
    // Turn 3 (R') takes 600ms against a typical 150ms, in every one of 6 solves.
    const results = Array.from({ length: 6 }, () => xr({ executions: [exec("T-Perm", [0, 150, 600, 150])] }));
    const f = buildXrayFindings(results).find((x) => x.id === "xray-alg-stall")!;
    expect(f.detail).toContain("turn 3 (R')");
    expect(f.msPerSolve).toBeCloseTo(450);
  });

  it("counts only last-slot inserts that are clearly shorter", () => {
    const oracle = (yours: number, better: number | null) =>
      ({ yours: { cost: yours }, better: better === null ? null : { cost: better }, skipAvailable: false }) as unknown as OracleReport;
    const results = [
      ...Array.from({ length: 4 }, () => xr({ flow: flow([0]), oracle: oracle(12, 8) })),
      xr({ flow: flow([0]), oracle: oracle(12, 11) }),
      xr({ flow: flow([0]), oracle: oracle(12, null) }),
    ];
    const f = buildXrayFindings(results).find((x) => x.id === "xray-last-slot")!;
    // 4 of 6 solves save 4 turns → 2.67 turns a solve × 200ms.
    expect(f.msPerSolve).toBeCloseTo((16 / 6) * 200);
  });
});

describe("mergeFindings", () => {
  it("folds the X-Ray's stall into the Coach's drill finding instead of double-counting", () => {
    const base = [{ id: "drill-algs", title: "Drill", detail: "Slow.", action: "", msPerSolve: 300, href: "/algspeed" }];
    const xray = [
      { id: "xray-alg-stall", source: "xray" as const, title: "Stall", detail: "T-Perm: turn 3", action: "", msPerSolve: 450, href: "/xray" },
      { id: "xray-neutrality", source: "xray" as const, title: "Neutral", detail: "", action: "", msPerSolve: 400, href: "/xray" },
    ];
    const merged = mergeFindings(base, xray);
    expect(merged.map((f) => f.id)).toEqual(["drill-algs", "xray-neutrality"]);
    expect(merged[0].msPerSolve).toBe(450);
    expect(merged[0].detail).toContain("T-Perm: turn 3");
  });
});
