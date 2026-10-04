import { describe, expect, it } from "vitest";
import type { CaseOccurrence } from "@/lib/analysis/caseHistory";
import type { Solve } from "@/types";
import { peekWeakCases, solvesRevision, weakCasesFromOccurrences } from "./weakCases";

function occ(name: string, totalMs: number, i: number): CaseOccurrence {
  return { group: "OLL", key: name, name, solveId: `s${i}`, date: i, recognitionMs: totalMs / 2, executionMs: totalMs / 2, turns: 8, execPauseMs: 0 };
}

const solve = (id: string, extra: Partial<Solve> = {}): Solve => ({ id, sessionId: "a", timeMs: 9000, penalty: "none", scramble: "R U", date: 1, ...extra });

describe("weakCasesFromOccurrences", () => {
  it("flags a case that runs well over the group average, once it has enough occurrences", () => {
    const occurrences = [
      ...[0, 1, 2].map((i) => occ("Sune", 1000, i)),
      ...[3, 4, 5].map((i) => occ("Cross", 1000, i)),
      ...[6, 7, 8].map((i) => occ("Slowpoke", 4000, i)),
      occ("Rare", 9000, 9),
    ];
    const weak = weakCasesFromOccurrences(occurrences);
    expect([...weak.oll]).toEqual(["Slowpoke"]);
    expect(weak.pll.size).toBe(0);
  });

  it("flags nothing with no history", () => {
    const weak = weakCasesFromOccurrences([]);
    expect(weak.oll.size + weak.pll.size).toBe(0);
  });
});

describe("solvesRevision", () => {
  it("changes when a solve is added, or goes DNF, but not for an unrelated edit", () => {
    const base = [solve("a", { reconstruction: "R", moveTimestamps: [1] }), solve("b")];
    const rev = solvesRevision(base);
    expect(solvesRevision(base.map((s) => ({ ...s, comment: "nice" })))).toBe(rev);
    expect(solvesRevision([...base, solve("c")])).not.toBe(rev);
    expect(solvesRevision([{ ...base[0], penalty: "dnf" }, base[1]])).not.toBe(rev);
  });
});

describe("peekWeakCases", () => {
  it("never computes — a revision that was not worked out reads as null", () => {
    expect(peekWeakCases("never-seen")).toBeNull();
  });
});
