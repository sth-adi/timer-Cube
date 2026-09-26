import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { solveBreakdown } from "./solveBreakdown";
import { caseRecords } from "./caseRecord";

const saved = (id: string, scramble: string, moves: string[], gap: number, date: number): Solve => ({
  id,
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => i * gap),
  timeMs: (moves.length - 1) * gap,
  date,
});

describe("caseRecords", () => {
  it("counts each case only where it was actually executed, skips aside", () => {
    const { scramble, moves } = fullSolveOn("U");
    const solves = [0, 1, 2].map((k) => saved(`s${k}`, scramble, moves, 120 + k * 10, k));
    const b = solveBreakdown(solves[0])!;
    const ollCase = b.rows.find((r) => r.label === "OLL")!.caseName!;
    const pllCase = b.rows.find((r) => r.label === "PLL")!.caseName!;

    const records = caseRecords(solves);
    expect(records.get(ollCase)!.count).toBe(3);
    expect(records.get(pllCase)!.count).toBe(3);
    expect(records.get(ollCase)!.bestMs).toBeLessThanOrEqual(records.get(ollCase)!.meanMs);
    // A keyboard solve with no breakdown contributes nothing and doesn't throw.
    const keyboard: Solve = { id: "k", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 4 };
    expect(() => caseRecords([...solves, keyboard])).not.toThrow();
    expect(caseRecords([...solves, keyboard]).get(ollCase)!.count).toBe(3);
  }, 60_000);

  it("never records a skip as a case with a time", () => {
    const records = caseRecords([]);
    for (const [name] of records) expect(name.toLowerCase()).not.toContain("skip");
  });
});
