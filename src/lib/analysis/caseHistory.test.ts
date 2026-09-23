import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { Solve } from "@/types";
import { caseStats, solveCases } from "./caseHistory";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";
/** The algorithm library keeps the last layer on U; the solver's frame has it on D (an x2 away). */
const X2: Record<string, string> = { U: "D", D: "U", F: "B", B: "F", R: "R", L: "L" };
const toEngine = (alg: string) => alg.split(" ").map((t) => X2[t[0]] + t.slice(1)).join(" ");
const plain = (alg: string) => alg.split(" ").every((t) => /^[URFDLB][2']?$/.test(t));

/**
 * A full timed solve built backwards so it's valid by construction: a real
 * cross and F2L, then a known OLL and a known PLL from the library, with
 * the scramble set to the inverse of the lot. 120ms a turn, `ollLook` before
 * the first OLL turn, `pllLook` before PLL, 300ms before each pair.
 */
function timedSolve(id: string, ollIndex: number, pllIndex: number, ollLook: number, pllLook: number) {
  const oll = OLL_CASES.filter((c) => plain(c.alg))[ollIndex];
  const pll = PLL_CASES.filter((c) => plain(c.alg))[pllIndex];
  const cross = solveCrossOptimal(SCRAMBLE);
  const cube = new Cube();
  cube.move(SCRAMBLE);
  if (cross.length) cube.move(cross.join(" "));
  const pairs = solveF2L(cube).map((p) => p.moves).filter((m) => m.length);
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
  const solve: Solve = { id, sessionId: "S", timeMs: t, penalty: "none", scramble: invertAlg(moves.join(" ")), date: Number(id.slice(1)), reconstruction: moves.join(" "), moveTimestamps: times };
  return { solve, oll, pll, pairs };
}

describe("solveCases", () => {
  it("finds the OLL and PLL of a solve, with recognition and execution split at the first turn", () => {
    for (const [o, p] of [[0, 0], [3, 2], [7, 5]]) {
      const { solve, oll, pll } = timedSolve(`s${o}`, o, p, 900, 650);
      const cases = solveCases(solve);
      const ollHit = cases.find((c) => c.group === "OLL")!;
      const pllHit = cases.find((c) => c.group === "PLL")!;
      expect(ollHit.name).toBe(oll.name);
      expect(pllHit.name).toBe(pll.name);
      expect(ollHit.recognitionMs).toBe(900);
      expect(pllHit.recognitionMs).toBe(650);
      expect(ollHit.executionMs).toBe((oll.alg.split(" ").length - 1) * 120);
      expect(pllHit.executionMs).toBe((pll.alg.split(" ").length - 1) * 120);
    }
  });

  it("names each F2L pair's case", () => {
    const { solve, pairs } = timedSolve("s1", 0, 0, 900, 650);
    const cases = solveCases(solve).filter((c) => c.group === "F2L");
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.length).toBeLessThanOrEqual(pairs.length);
    for (const c of cases) {
      expect(c.recognitionMs).toBe(300);
      expect(c.f2l?.pairFacelets).toHaveLength(5);
    }
  });

  it("ignores solves without timing, and DNFs", () => {
    const { solve } = timedSolve("s1", 0, 0, 900, 650);
    expect(solveCases({ ...solve, moveTimestamps: undefined })).toEqual([]);
    expect(solveCases({ ...solve, penalty: "dnf" })).toEqual([]);
  });
});

describe("caseStats", () => {
  it("counts, averages and shares per case, most frequent first", () => {
    const occ = [
      { group: "OLL" as const, key: "Sune", name: "Sune", solveId: "a", date: 1, recognitionMs: 400, executionMs: 800 },
      { group: "OLL" as const, key: "Sune", name: "Sune", solveId: "b", date: 3, recognitionMs: 600, executionMs: 1000 },
      { group: "OLL" as const, key: "H", name: "H", solveId: "c", date: 2, recognitionMs: 300, executionMs: 900 },
      { group: "PLL" as const, key: "T", name: "T", solveId: "a", date: 1, recognitionMs: 1, executionMs: 1 },
    ];
    const stats = caseStats(occ, "OLL", 4);
    expect(stats.map((s) => s.key)).toEqual(["Sune", "H"]);
    expect(stats[0]).toMatchObject({ count: 2, share: 0.5, recognitionMs: 500, executionMs: 900, totalMs: 1400, bestTotalMs: 1200, lastSeen: 3 });
    expect(stats[0].occurrences.map((o) => o.date)).toEqual([3, 1]);
  });
});
