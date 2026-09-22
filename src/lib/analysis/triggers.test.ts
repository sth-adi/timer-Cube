import { describe, expect, it } from "vitest";
import { computeTriggerStats } from "./triggers";
import type { Solve } from "@/types";

function solve(reconstruction: string, moveTimestamps: number[]): Solve {
  return {
    id: Math.random().toString(),
    sessionId: "s",
    timeMs: moveTimestamps[moveTimestamps.length - 1] ?? 0,
    penalty: "none",
    scramble: "",
    date: Date.now(),
    reconstruction,
    moveTimestamps,
  };
}

describe("computeTriggerStats", () => {
  it("drops pairs seen fewer than 3 times as noise", () => {
    // "R U", "U R'", "R' U'" each occur exactly once in a single solve.
    const stats = computeTriggerStats([solve("R U R' U'", [0, 100, 250, 400])]);
    expect(stats).toEqual([]);
  });

  it("averages a pair's gap once it recurs often enough", () => {
    // "R U" recurs 3x across 3 solves, with gaps 100/200/300 -> avg 200.
    const solves = [solve("R U", [0, 100]), solve("R U", [0, 200]), solve("R U", [0, 300])];
    const stats = computeTriggerStats(solves);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ pair: "R U", first: "R", second: "U", count: 3, avgMs: 200 });
  });

  it("excludes an implausibly long gap (a thinking pause, not a turn) from the average", () => {
    const solves = [solve("R U", [0, 100]), solve("R U", [0, 150]), solve("R U", [0, 5000]), solve("R U", [0, 120])];
    const stats = computeTriggerStats(solves);
    // The 5000ms gap solve is excluded outright, leaving 3 usable samples averaging (100+150+120)/3.
    expect(stats[0].count).toBe(3);
    expect(stats[0].avgMs).toBeCloseTo((100 + 150 + 120) / 3, 5);
  });

  it("skips a solve whose token count doesn't match its timestamp count", () => {
    const stats = computeTriggerStats([
      solve("R U R'", [0, 100]), // 3 tokens, 2 timestamps — malformed, ignored entirely
      solve("R U R'", [0, 100, 200]),
      solve("R U R'", [0, 100, 200]),
      solve("R U R'", [0, 100, 200]),
    ]);
    // Only the 3 well-formed solves contribute, so "R U" and "U R'" each hit count 3.
    expect(stats.find((s) => s.pair === "R U")?.count).toBe(3);
  });

  it("ignores solves with no reconstruction or no timestamps", () => {
    const bare: Solve = { id: "x", sessionId: "s", timeMs: 1000, penalty: "none", scramble: "", date: Date.now() };
    expect(computeTriggerStats([bare, bare, bare])).toEqual([]);
  });
});
