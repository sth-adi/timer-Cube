import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { solveBreakdown } from "./solveBreakdown";
import { recognizeF2lCase } from "./f2lCase";
import { Cube } from "@/lib/cube-engine/engine";
import { f2lCaseStats, solveF2lTurns } from "./f2lCaseStats";

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

describe("f2lCaseStats", () => {
  it("counts each F2L pair's turns against its own recognized case, across repeats", () => {
    const { scramble, moves } = fullSolveOn("U");
    const solves = [0, 1, 2].map((k) => saved(`s${k}`, scramble, moves, 130 + k * 5, k));
    const b = solveBreakdown(solves[0])!;
    const pairRow = b.rows.find((r) => r.f2lPairIndex !== null && r.startMs !== null && r.atMs !== null)!;
    const cube = new Cube();
    const before = b.frameMoves.filter((m) => m.timeStampMs <= pairRow.startMs!).map((m) => m.token);
    const alg = [b.frameScramble, ...before].join(" ").trim();
    if (alg) cube.move(alg);
    const f2l = recognizeF2lCase(cube, pairRow.f2lPairIndex!)!;

    const stats = f2lCaseStats(solves);
    const stat = stats.get(f2l.key)!;
    expect(stat.count).toBe(3);
    expect(stat.bestTurns).toBeLessThanOrEqual(stat.meanTurns);
    expect(stat.bestTurns).toBeGreaterThan(0);
  }, 60_000);

  it("skips solves without a breakdown and empty input, without throwing", () => {
    const keyboard: Solve = { id: "k", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 0 };
    expect(() => f2lCaseStats([keyboard])).not.toThrow();
    expect(f2lCaseStats([]).size).toBe(0);
    expect(f2lCaseStats([keyboard]).size).toBe(0);
  });

  it("replays each solve's pairs once: repeat calls and a longer list reuse the cached rows", () => {
    const { scramble, moves } = fullSolveOn("U");
    const solves = [0, 1].map((k) => saved(`c${k}`, scramble, moves, 130 + k * 5, k));
    const rows = solves.map(solveF2lTurns);
    expect(rows[0].length).toBeGreaterThan(0);
    const first = f2lCaseStats(solves);
    const added = saved("c2", scramble, moves, 140, 2);
    const second = f2lCaseStats([...solves, added]);
    solves.forEach((s, i) => expect(solveF2lTurns(s)).toBe(rows[i]));
    for (const [key, stat] of first) expect(second.get(key)!.count).toBe(stat.count + 1);
  }, 60_000);
});
