import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { filterAndSort, presentCases, solveSummary } from "./solveFilter";

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

describe("filtering and sorting solves", () => {
  const white = fullSolveOn("U");
  const yellow = fullSolveOn("D");
  const a = saved("a", white.scramble, white.moves, 150, 1);
  const b = saved("b", yellow.scramble, yellow.moves, 100, 2);
  const keyboard: Solve = { id: "k", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 3 };
  const all = [a, b, keyboard];

  it("summarises a smart-cube solve's steps and cases", () => {
    const m = solveSummary(b)!;
    expect(m.crossFace).toBe("D");
    expect(m.steps.reduce((x, y) => x + y, 0)).toBe(b.timeMs);
    expect(m.oll).not.toBeNull();
    expect(solveSummary(keyboard)).toBeNull();
  }, 60_000);

  it("filters by cross colour and case, and sorts by a step", () => {
    expect(filterAndSort(all, { cross: "D" }, "recent").map((s) => s.id)).toEqual(["b"]);
    const pll = solveSummary(a)!.pll!;
    expect(filterAndSort(all, { pll }, "recent").map((s) => s.id)).toContain("a");
    expect(filterAndSort(all, {}, "recent").map((s) => s.id)).toEqual(["k", "b", "a"]);
    expect(filterAndSort(all, {}, "fastest")[0].id).not.toBe("k");
    // Slowest F2L first; the keyboard solve (no breakdown) last.
    const byF2l = filterAndSort(all, {}, "f2l").map((s) => s.id);
    expect(byF2l[2]).toBe("k");
    expect(presentCases(all).crosses.sort()).toEqual(["D", "U"]);
  }, 60_000);
});
