import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { solveCases } from "./caseHistory";
import { solveCrossLengths } from "./crossAdvisor";
import { solveF2lTurns } from "./f2lCaseStats";
import { solveBreakdown } from "./solveBreakdown";
import { NO_HISTORY, computeHistoryStats, scheduleHistoryStats, warmSolveHistory, type HistoryStats, type IdleScheduler } from "./historyStats";

const saved = (id: string, scramble: string, moves: string[], gap: number, date: number): Solve => ({
  id,
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => (i + 1) * gap),
  timeMs: moves.length * gap,
  date,
});

/** An idle scheduler the test drives by hand: each queued step runs when `flush` is called, with a fixed budget. */
function manualScheduler(budget: number) {
  const queue: ((b: () => number) => void)[] = [];
  const schedule: IdleScheduler = (step) => {
    queue.push(step);
    return () => {
      const i = queue.indexOf(step);
      if (i >= 0) queue.splice(i, 1);
    };
  };
  return {
    schedule,
    pending: () => queue.length,
    flush() {
      const step = queue.shift();
      step?.(() => budget);
    },
  };
}

describe("historyStats", () => {
  const { scramble, moves } = fullSolveOn("U");
  const solves = [0, 1, 2, 3].map((k) => saved(`h${k}`, scramble, moves, 120 + k * 7, k));

  it("hands over exactly what the synchronous analyses give", () => {
    const sched = manualScheduler(1000);
    let got: HistoryStats | null = null;
    scheduleHistoryStats(solves, (s) => (got = s), sched.schedule);
    expect(got).toBeNull();
    sched.flush();
    expect(got).toEqual(computeHistoryStats(solves));
    expect(got!.caseHistory.size + got!.f2lHistory.size + got!.recogHistory.size).toBeGreaterThan(0);
  }, 60_000);

  it("works in slices when idle time is short, newest solves first, and reports once at the end", () => {
    const fresh = [10, 11, 12].map((k) => saved(`f${k}`, scramble, moves, 130 + k, k));
    const sched = manualScheduler(0);
    let calls = 0;
    scheduleHistoryStats(fresh, () => calls++, sched.schedule);
    // One solve per slice when there's no budget: newest first.
    sched.flush();
    expect(calls).toBe(0);
    expect(solveBreakdown(fresh[2])).not.toBeNull();
    expect(sched.pending()).toBe(1);
    sched.flush();
    sched.flush();
    expect(calls).toBe(1);
    expect(sched.pending()).toBe(0);
  }, 60_000);

  it("never reports after it is cancelled", () => {
    const sched = manualScheduler(1000);
    let calls = 0;
    const cancel = scheduleHistoryStats(solves, () => calls++, sched.schedule);
    cancel();
    expect(sched.pending()).toBe(0);
    sched.flush();
    expect(calls).toBe(0);
  });

  it("reports an empty history for no solves", () => {
    const sched = manualScheduler(1000);
    let got: HistoryStats | null = null;
    scheduleHistoryStats([], (s) => (got = s), sched.schedule);
    sched.flush();
    expect(got).toEqual(NO_HISTORY);
  });

  it("a second pass over the same solves recomputes nothing; one new solve costs only itself", () => {
    const list = [20, 21, 22].map((k) => saved(`p${k}`, scramble, moves, 125 + k, k));
    list.forEach(warmSolveHistory);
    const snap = (s: Solve) => [solveBreakdown(s), solveCases(s), solveF2lTurns(s), solveCrossLengths(s)];
    const before = list.map(snap);
    computeHistoryStats(list);
    const added = saved("p23", scramble, moves, 150, 23);
    computeHistoryStats([...list, added]);
    list.forEach((s, i) => snap(s).forEach((v, j) => expect(v).toBe(before[i][j])));
    // The new solve got its own entries; computing again reuses them.
    const a = snap(added);
    expect(snap(added)).toEqual(a);
    snap(added).forEach((v, j) => expect(v).toBe(a[j]));
  }, 60_000);
});
