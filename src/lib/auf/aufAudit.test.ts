import { describe, expect, it } from "vitest";
import { invertMoves } from "@/lib/xray/common";
import { aufLabel, buildAufReport, solveAufs } from "./aufAudit";

// Engine frame (last layer on D): Sune and T-perm, x2 from the usual notation.
const SUNE = "R D R' D R D2 R'".split(" ");
const TPERM = "R D R' D' R' B R2 D' R' D' R D R' B'".split(" ");

function capture(pre: string[], prePll: string[], final: string[], pauses: { prePll?: number; final?: number } = {}) {
  const moves = [...pre, ...SUNE, ...prePll, ...TPERM, ...final];
  const scramble = invertMoves(moves).join(" ");
  const prePllAt = pre.length + SUNE.length;
  const finalAt = prePllAt + prePll.length + TPERM.length;
  let t = 0;
  const timesMs = moves.map((_, i) => {
    if (i > 0) t += i === prePllAt ? (pauses.prePll ?? 150) : i === finalAt && final.length ? (pauses.final ?? 150) : 150;
    return t;
  });
  return { scramble, moves, timesMs };
}

describe("solveAufs", () => {
  it("finds all three AUFs and times the pauses before them", () => {
    const r = solveAufs(capture(["D"], ["D", "D"], ["D'"], { prePll: 900, final: 500 }))!;
    expect(r.stages.map((s) => s.stage)).toEqual(["preOll", "prePll", "final"]);
    const [pre, pll, fin] = r.stages.map((s) => s.event!);
    expect(pre.net).toBe(1);
    expect(pll.tokens).toEqual(["D", "D"]);
    expect(pll.net).toBe(2);
    expect(pll.wastedQuarters).toBe(0);
    expect(pll.waitMs).toBe(900);
    expect(pll.turnMs).toBe(150);
    expect(fin.net).toBe(3);
    expect(fin.waitMs).toBe(500);
    expect(aufLabel(fin.net)).toBe("U'");
  });

  it("counts the long way round as wasted", () => {
    const r = solveAufs(capture([], [], ["D", "D", "D"]))!;
    const fin = r.stages.find((s) => s.stage === "final")!.event!;
    expect(fin.net).toBe(3);
    expect(fin.usedQuarters).toBe(3);
    expect(fin.wastedQuarters).toBe(2);
    expect(r.stages.find((s) => s.stage === "preOll")!.event).toBeNull();
  });

  it("ignores unfinished solves", () => {
    expect(solveAufs({ scramble: "R", moves: ["R"], timesMs: [0] })).toBeNull();
    expect(solveAufs({ scramble: "R U", moves: ["R'"], timesMs: [0] })).toBeNull();
  });
});

describe("buildAufReport", () => {
  it("flags a slow final AUF and wasted turns", () => {
    const solves = Array.from({ length: 6 }, () => solveAufs(capture(["D"], ["D'"], ["D", "D", "D"], { final: 700 })));
    const r = buildAufReport(solves)!;
    expect(r.solves).toBe(6);
    const fin = r.stages[2];
    expect(fin.neededRate).toBe(1);
    expect(fin.avgWaitMs).toBe(700);
    expect(fin.wastedRate).toBe(1);
    expect(fin.byNet["U'"]).toBe(6);
    expect(r.insights.join(" ")).toMatch(/pause 0.70s before the final AUF/);
    expect(r.insights.join(" ")).toMatch(/extra turns/);
    expect(r.avgOverheadMs).toBeGreaterThan(700);
  });
});
