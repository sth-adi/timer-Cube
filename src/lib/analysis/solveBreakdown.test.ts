import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { hasBreakdown, solveBreakdown } from "./solveBreakdown";

const saved = (scramble: string, moves: string[], gap = 150): Solve => ({
  id: "s",
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => i * gap),
  timeMs: (moves.length - 1) * gap,
  date: 0,
});

describe("a saved solve's breakdown", () => {
  for (const face of ["U", "D"] as const) {
    it(`rebuilds the recap for a ${face === "U" ? "white" : "yellow"}-cross solve`, () => {
      const { scramble, moves } = fullSolveOn(face);
      const b = solveBreakdown(saved(scramble, moves))!;
      expect(b.crossFace).toBe(face);
      expect(b.rows.map((r) => r.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]);
      expect(b.rows.every((r) => r.totalMs !== null)).toBe(true);
      // The steps add up to the solve.
      expect(b.rows.reduce((a, r) => a + r.totalMs!, 0)).toBe(b.totalMs);
      expect(b.rows.find((r) => r.label === "OLL")!.caseName).not.toBeNull();
      expect(b.rows.find((r) => r.label === "PLL")!.caseName).not.toBeNull();
      expect(b.executions.map((e) => e.step)).toContain("PLL");
    }, 60_000);
  }

  it("declines solves it can't rebuild", () => {
    expect(hasBreakdown({ ...saved("R", ["R'"]), moveTimestamps: [] })).toBe(false);
    expect(solveBreakdown(saved("R U", ["R'"]))).toBeNull(); // doesn't end solved
  });
});
