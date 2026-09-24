import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { CaseGroup, CaseStat } from "@/lib/analysis/caseHistory";
import type { Solve } from "@/types";
import { MIN_CASES, MIN_OCCURRENCES, analyzeBottlenecks, classifyBottleneck, rankBottlenecks, summarizeBottlenecks, type CaseBottleneck } from "./bottleneck";

describe("classifyBottleneck", () => {
  it("calls it recognition-bound, execution-bound, or balanced by share", () => {
    expect(classifyBottleneck(700, 300)).toBe("recognition");
    expect(classifyBottleneck(300, 700)).toBe("execution");
    expect(classifyBottleneck(500, 500)).toBe("balanced");
    expect(classifyBottleneck(0, 0)).toBe("balanced");
  });
});

function stat(overrides: Partial<CaseStat> & { key: string; recognitionMs: number; executionMs: number }): CaseStat {
  return {
    group: "OLL",
    name: overrides.key,
    count: MIN_OCCURRENCES,
    share: 0.1,
    totalMs: overrides.recognitionMs + overrides.executionMs,
    bestTotalMs: overrides.recognitionMs + overrides.executionMs,
    lastSeen: 1,
    occurrences: [],
    ...overrides,
  };
}

describe("rankBottlenecks", () => {
  it("drops cases under MIN_OCCURRENCES and sorts by cumulative cost", () => {
    const stats = [
      stat({ key: "rare", recognitionMs: 900, executionMs: 100, count: MIN_OCCURRENCES - 1 }),
      stat({ key: "cheap", recognitionMs: 100, executionMs: 100, count: MIN_OCCURRENCES }),
      stat({ key: "expensive", recognitionMs: 800, executionMs: 800, count: MIN_OCCURRENCES }),
    ];
    const ranked = rankBottlenecks(stats);
    expect(ranked.map((r) => r.key)).toEqual(["expensive", "cheap"]);
    expect(ranked[0].costMs).toBeCloseTo(1600 * MIN_OCCURRENCES);
    expect(ranked[0].kind).toBe("balanced");
  });

  it("computes recognitionShare and kind correctly", () => {
    const [r] = rankBottlenecks([stat({ key: "slow-look", recognitionMs: 900, executionMs: 300 })]);
    expect(r.recognitionShare).toBeCloseTo(0.75);
    expect(r.kind).toBe("recognition");
  });
});

describe("summarizeBottlenecks", () => {
  const case_ = (key: string, kind: CaseBottleneck["kind"], costMs: number): CaseBottleneck => ({
    group: "OLL",
    key,
    name: key,
    count: MIN_OCCURRENCES,
    recognitionMs: kind === "recognition" ? 800 : kind === "execution" ? 200 : 500,
    executionMs: kind === "recognition" ? 200 : kind === "execution" ? 800 : 500,
    totalMs: 1000,
    recognitionShare: kind === "recognition" ? 0.8 : kind === "execution" ? 0.2 : 0.5,
    kind,
    costMs,
  });

  it("returns null under MIN_CASES", () => {
    const cases = Array.from({ length: MIN_CASES - 1 }, (_, i) => case_(`c${i}`, "recognition", 100 * (i + 1)));
    expect(summarizeBottlenecks(cases)).toBeNull();
  });

  it("splits into recognition/execution buckets and leads with the costliest case", () => {
    const cases = [case_("worst", "execution", 5000), case_("a", "recognition", 400), case_("b", "recognition", 300), case_("c", "execution", 200), case_("d", "balanced", 100)];
    const report = summarizeBottlenecks(cases)!;
    expect(report).not.toBeNull();
    expect(report.cases[0].key).toBe("worst");
    expect(report.recognitionBound.map((c) => c.key)).toEqual(["a", "b"]);
    expect(report.executionBound.map((c) => c.key)).toEqual(["worst", "c"]);
    expect(report.headline).toMatch(/recognition-bound.*execution-bound/);
    expect(report.headline).toMatch(/worst costs you the most/);
    expect(report.headline).toMatch(/mostly execution/);
  });

  it("headline calls out an all-recognition or all-execution split", () => {
    const allRecognition = Array.from({ length: MIN_CASES }, (_, i) => case_(`r${i}`, "recognition", 100));
    expect(summarizeBottlenecks(allRecognition)!.headline).toMatch(/recognition-bound — the algorithms are fine/);
    const allExecution = Array.from({ length: MIN_CASES }, (_, i) => case_(`e${i}`, "execution", 100));
    expect(summarizeBottlenecks(allExecution)!.headline).toMatch(/execution-bound — you see them fine/);
  });
});

describe("analyzeBottlenecks", () => {
  const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";
  const X2: Record<string, string> = { U: "D", D: "U", F: "B", B: "F", R: "R", L: "L" };
  const toEngine = (alg: string) => alg.split(" ").map((t) => X2[t[0]] + t.slice(1)).join(" ");
  const plain = (alg: string) => alg.split(" ").every((t) => /^[URFDLB][2']?$/.test(t));
  const OLL_POOL = OLL_CASES.filter((c) => plain(c.alg));
  const PLL_POOL = PLL_CASES.filter((c) => plain(c.alg));

  /** A real, valid timed solve: a genuine cross+F2L, then a known OLL/PLL with a controlled recognition pause before each. */
  function timedSolve(id: string, ollIndex: number, pllIndex: number, ollLook: number, pllLook: number): Solve {
    const oll = OLL_POOL[ollIndex];
    const pll = PLL_POOL[pllIndex];
    const cross = solveCrossOptimal(SCRAMBLE);
    const cube = new Cube();
    cube.move(SCRAMBLE);
    if (cross.length) cube.move(cross.join(" "));
    const pairs = solveF2L(cube)
      .map((p) => p.moves)
      .filter((m) => m.length);
    const moves: string[] = [];
    const times: number[] = [];
    let t = 0;
    const add = (ms: string[], firstGap: number) =>
      ms.forEach((m, i) => {
        t += i === 0 ? firstGap : 120;
        moves.push(m);
        times.push(t);
      });
    add(cross, 120);
    for (const p of pairs) add(p, 300);
    add(toEngine(oll.alg).split(" "), ollLook);
    add(toEngine(pll.alg).split(" "), pllLook);
    return { id, sessionId: "S", timeMs: t, penalty: "none", scramble: invertAlg(moves.join(" ")), date: Number(id.slice(1)) || 1, reconstruction: moves.join(" "), moveTimestamps: times };
  }

  it("classifies real recognition-heavy vs execution-heavy OLL cases from real solves", () => {
    const solves: Solve[] = [];
    // Case A (ollIndex 0): a long look every time -> recognition-bound.
    // Case B (ollIndex 1): almost no look -> execution-bound.
    for (let i = 0; i < MIN_OCCURRENCES; i++) {
      solves.push(timedSolve(`a${i}`, 0, i % PLL_POOL.length, 6000, 500));
      solves.push(timedSolve(`b${i}`, 1, (i + 1) % PLL_POOL.length, 20, 500));
    }
    const report = analyzeBottlenecks(solves);
    expect(report).not.toBeNull();
    const ollCases = report!.cases.filter((c) => c.group === "OLL" as CaseGroup);
    const caseA = ollCases.find((c) => c.name === OLL_POOL[0].name);
    const caseB = ollCases.find((c) => c.name === OLL_POOL[1].name);
    expect(caseA?.kind).toBe("recognition");
    expect(caseB?.kind).toBe("execution");
  });

  it("returns null with too little case history", () => {
    expect(analyzeBottlenecks([timedSolve("only", 0, 0, 500, 500)])).toBeNull();
  });
});
