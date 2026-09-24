import { describe, expect, it } from "vitest";
import type { CaseOccurrence } from "./caseHistory";
import { MIN_OCCURRENCES, MIN_SOLVES, summarizeF2lConsistency } from "./f2lConsistency";

const occ = (key: string, turns: number, executionMs = turns * 150): CaseOccurrence => ({
  group: "F2L",
  key,
  name: key,
  solveId: "s",
  date: 1,
  recognitionMs: 500,
  executionMs,
  turns,
  execPauseMs: 0,
});

describe("summarizeF2lConsistency", () => {
  it("returns null under MIN_SOLVES", () => {
    expect(summarizeF2lConsistency([occ("a", 8), occ("a", 8), occ("a", 8)], MIN_SOLVES - 1)).toBeNull();
  });

  it("ranks cases by how far their typical turn count sits above your own best", () => {
    const settled = [8, 8, 9, 8].map((t) => occ("settled", t));
    const messy = [7, 12, 12, 13, 11].map((t) => occ("messy", t));
    const rare = [5, 15].map((t) => occ("rare", t)); // under MIN_OCCURRENCES
    const r = summarizeF2lConsistency([...settled, ...messy, ...rare], 20)!;
    expect(r.cases.map((c) => c.key)).toEqual(["messy", "settled"]);
    const m = r.cases[0];
    expect(m.bestTurns).toBe(7);
    expect(m.medianTurns).toBe(12);
    expect(m.spread).toBe(5);
    // 5 extra turns × 150ms × 5 occurrences / 20 solves
    expect(m.lostMsPerSolve).toBeCloseTo((5 * 150 * 5) / 20);
    expect(r.worst.map((c) => c.key)).toEqual(["messy"]); // settled is within 2 turns of its best
    expect(r.headline).toMatch(/"messy" is the least settled: you've done it in 7 turns but usually take 12/);
    expect(rare.length).toBeLessThan(MIN_OCCURRENCES);
  });

  it("says so when every regular case is already consistent", () => {
    const r = summarizeF2lConsistency([8, 8, 9].map((t) => occ("a", t)), 20)!;
    expect(r.worst).toEqual([]);
    expect(r.headline).toMatch(/settled/);
  });
});
