import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { newCube } from "@/lib/cube-engine/engine";
import { crossSolvedOn } from "@/lib/smartcube/crossFrame";
import { stepRecord, stepStats, TREND_WINDOW } from "./stepStats";

const HOUR = 3_600_000;
const { scramble, moves } = fullSolveOn("U");
/** The first turn after the cross is done. */
const afterCross = (() => {
  const c = newCube();
  c.move(scramble);
  return moves.findIndex((m) => (c.move(m), crossSolvedOn(c, "U"))) + 1;
})();

const saved = (id: string, scramble: string, moves: string[], gap: number, date: number): Solve => ({
  id,
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  // A 1s look for the first pair, as the cross goes in.
  moveTimestamps: moves.map((_, i) => i * gap + (i >= afterCross ? 1000 : 0)),
  timeMs: (moves.length - 1) * gap + 1000,
  date,
});

describe("step stats", () => {
  it("splits a solve into its four steps, with looking inside each", () => {
    const s = saved("a", scramble, moves, 100, 0);
    const r = stepRecord(s)!;
    expect(r.totalMs.reduce((a, b) => a + b, 0)).toBe(s.timeMs);
    r.lookMs.forEach((look, i) => expect(look).toBeLessThanOrEqual(r.totalMs[i]));
    expect(r.lookMs[0]).toBe(0);
    expect(r.lookMs[1]).toBeGreaterThanOrEqual(1100);
    expect(stepRecord({ id: "k", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 0 })).toBeNull();
  }, 60_000);

  it("compares the latest sitting with the one before", () => {
    const before = [0, 1, 2].map((k) => saved(`b${k}`, scramble, moves, 150, k * 60_000));
    const now = [0, 1, 2].map((k) => saved(`n${k}`, scramble, moves, 100, 5 * HOUR + k * 60_000));
    // A lone solve in between is its own sitting, too small to compare with.
    const lone = saved("l", scramble, moves, 300, 3 * HOUR);
    const rep = stepStats([...now, lone, ...before])!;
    expect(rep.sampleSize).toBe(7);
    expect(rep.sittings).toEqual({ current: 3, previous: 3 });
    for (const st of rep.steps) {
      expect(st.lookMs + st.turnMs).toBeCloseTo(st.meanMs);
      expect(st.ao12Ms).toBeNull();
      // Faster turning now, the same pauses: every step with turns in it is quicker.
      if (st.meanMs > 1000) expect(st.deltaMs!).toBeLessThan(0);
    }
    expect(rep.steps.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  }, 60_000);

  it("gives an ao12 from 12 solves, and no comparison within one sitting", () => {
    const solves = Array.from({ length: 12 }, (_, k) => saved(`s${k}`, scramble, moves, 100 + k, k * 60_000));
    const rep = stepStats(solves)!;
    expect(rep.sittings).toBeNull();
    expect(rep.steps.every((s) => s.ao12Ms !== null && s.deltaMs === null)).toBe(true);
    expect(rep.steps[1].bestMs).toBeLessThanOrEqual(rep.steps[1].ao12Ms!);
    for (const st of rep.steps) expect(st.trend.length).toBe(12);
  }, 60_000);

  it("caps the trend at TREND_WINDOW solves, oldest first", () => {
    const solves = Array.from({ length: 25 }, (_, k) => saved(`s${k}`, scramble, moves, 100 + k, k * 60_000));
    const rep = stepStats(solves)!;
    const lastSolveRecord = stepRecord(solves[solves.length - 1])!;
    for (let i = 0; i < rep.steps.length; i++) {
      const st = rep.steps[i];
      expect(st.trend.length).toBe(TREND_WINDOW);
      // The most recent solve (the slowest gap, 24) is last in the trend, not first.
      expect(st.trend[st.trend.length - 1]).toBe(lastSolveRecord.totalMs[i]);
    }
  }, 60_000);
});
