import { describe, expect, it } from "vitest";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import type { CaseOccurrence } from "./caseHistory";
import { MIN_SOLVES, bookTurns, classifyAlg, summarizeAlgSpeed } from "./algSpeed";

describe("bookTurns", () => {
  it("counts a slice turn as two face turns, the way a smart cube reports it", () => {
    const withSlice = PLL_CASES.find((c) => /\bM/.test(c.alg))!;
    const tokens = withSlice.alg.split(/\s+/).filter((t) => t && !/^[xyz]/.test(t));
    const slices = tokens.filter((t) => /^[MES]/.test(t)).length;
    expect(bookTurns("PLL", withSlice.name)).toBeGreaterThanOrEqual(tokens.length - 2 + slices - 2);
    expect(bookTurns("PLL", "no such case")).toBeNull();
  });
});

describe("classifyAlg", () => {
  it("tells a second look, a mid-alg stop, slow fingers and a long route apart", () => {
    expect(classifyAlg(8, 8, 20, 10, 900)).toBe("two-look");
    expect(classifyAlg(8, 8, 11, 10, 900)).toBe("hesitates");
    expect(classifyAlg(5, 8, 11, 10, 0)).toBe("slow-hands");
    expect(classifyAlg(8, 8, 20, 10, 0)).toBe("long-route");
    expect(classifyAlg(8, 8, 11, 10, 0)).toBe("fine");
  });
});

describe("summarizeAlgSpeed", () => {
  const oll = OLL_CASES[0];
  const pll = PLL_CASES[0];
  const ollBook = bookTurns("OLL", oll.name)!;
  const pllBook = bookTurns("PLL", pll.name)!;
  const make = (group: "OLL" | "PLL", name: string, turns: number, executionMs: number, execPauseMs: number): CaseOccurrence => ({
    group,
    key: name,
    name,
    solveId: "s",
    date: 1,
    recognitionMs: 600,
    executionMs,
    turns,
    execPauseMs,
  });

  it("returns null under MIN_SOLVES", () => {
    expect(summarizeAlgSpeed([make("PLL", pll.name, pllBook, 1500, 0)], MIN_SOLVES - 1)).toBeNull();
  });

  it("measures speed with pauses taken out, and prices a two-look case against the book alg at your pace", () => {
    // PLL at a clean 8 TPS sets the baseline; the OLL is done in two looks (twice the turns, a 1s stop).
    const plls = Array.from({ length: 6 }, () => make("PLL", pll.name, pllBook, (pllBook / 8) * 1000, 0));
    const olls = Array.from({ length: 4 }, () => make("OLL", oll.name, ollBook * 2 + 4, ((ollBook * 2 + 4) / 8) * 1000 + 1000, 1000));
    const r = summarizeAlgSpeed([...plls, ...olls], 20)!;
    expect(r.baselineTps).toBeCloseTo(8, 0);
    const o = r.algs.find((a) => a.name === oll.name)!;
    expect(o.verdict).toBe("two-look");
    expect(o.medianTps).toBeCloseTo(8, 0); // hands are fine — it's the extra look
    // Saving = what it takes now − the book alg at 8 TPS.
    expect(o.savableMs).toBeCloseTo(o.medianExecMs - (ollBook / 8) * 1000, 0);
    expect(r.twoLookOllShare).toBe(1);
    expect(r.headline).toMatch(/100% of your OLLs take two looks/);
    expect(r.algs.find((a) => a.name === pll.name)!.verdict).toBe("fine");
  });
});
