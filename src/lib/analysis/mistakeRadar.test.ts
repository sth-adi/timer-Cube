import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { aggregateMistakes, analyzeMistakes, mistakeHabits } from "./mistakeRadar";

/** Inverse of a move sequence — scrambling with inv(W) makes W an exact solution. */
function inv(seq: string): string {
  return seq
    .split(" ")
    .reverse()
    .map((t) => (t.endsWith("'") ? t[0] : t.endsWith("2") ? t : `${t}'`))
    .join(" ");
}

/**
 * Builds a solve from phrases: each phrase is turned at `gapMs` per move,
 * with a `pauseMs` look between phrases. Moves are in this engine's frame
 * (cross on U, last layer on D — so "R D R'" is the everyday "R U R'").
 */
function solve(phrases: string[], gapMs = 120, pauseMs = 700) {
  const moves: string[] = [];
  const timesMs: number[] = [];
  let t = 0;
  phrases.forEach((phrase, p) => {
    if (p > 0) t += pauseMs;
    for (const m of phrase.split(" ")) {
      moves.push(m);
      timesMs.push(t);
      t += gapMs;
    }
  });
  const all = moves.join(" ");
  return { scramble: inv(all), moves, timesMs, totalMs: timesMs[timesMs.length - 1] };
}

const SUNE = "R D R' D R D2 R'";
const T_PERM = "R D R' D' R' B R2 D' R' D' R D R' B'";

describe("analyzeMistakes", () => {
  it("finds nothing in a clean solve", () => {
    const report = analyzeMistakes(solve(["R D R' D'", "L' D' L", "D R D' R'"]));
    expect(report.mistakes).toEqual([]);
    expect(report.cleanScore).toBe(100);
  });

  it("flags an already-solved F2L pair knocked out and rebuilt", () => {
    const report = analyzeMistakes(
      solve(["R D R' D' L' D' L D R D2 R' D B D' B' D' R D' R' D2 F D F'"]),
    );
    const knocked = report.mistakes.filter((m) => m.kind === "pair-knocked");
    expect(knocked).toHaveLength(1);
    expect(knocked[0].title).toBe("Knocked out the blue-red pair");
    expect(knocked[0].moveIndex).toBe(8);
    expect(knocked[0].costMs).toBe(10 * 120);
  });

  it("does not flag pairs taken apart and restored inside an OLL/PLL algorithm", () => {
    const report = analyzeMistakes(solve(["R D R' D'", T_PERM]));
    expect(report.mistakes.filter((m) => m.kind === "pair-knocked" || m.kind === "cross-broken")).toEqual([]);
  });

  it("flags a 2-look OLL", () => {
    const report = analyzeMistakes(solve(["R D R' D'", SUNE, `D ${SUNE}`]));
    const extra = report.mistakes.filter((m) => m.kind === "extra-oll-look");
    expect(extra).toHaveLength(1);
    expect(extra[0].phase).toBe("OLL");
    expect(extra[0].costMs).toBeGreaterThan(700);
  });

  it("flags a 2-look PLL, but not a plain AUF pause", () => {
    const twoLook = analyzeMistakes(solve(["R D R' D'", T_PERM, `D ${T_PERM}`]));
    expect(twoLook.mistakes.filter((m) => m.kind === "extra-pll-look")).toHaveLength(1);

    const aufOnly = analyzeMistakes(solve(["R D R' D'", T_PERM, "D"]));
    expect(aufOnly.mistakes.filter((m) => m.kind === "extra-pll-look")).toEqual([]);
  });

  it("flags turns that cancel or could have been one", () => {
    const report = analyzeMistakes(solve(["R R' D R D2 D"]));
    const wasted = report.mistakes.filter((m) => m.kind === "wasted-turns");
    expect(wasted.map((m) => m.title)).toEqual(["Turn undone", "Turn could have been one"]);
  });

  it("does not flag a half turn made of two identical quarter turns — how smart cubes report D2", () => {
    const report = analyzeMistakes(solve(["R D D R' D' D' R"]));
    expect(report.mistakes.filter((m) => m.kind === "wasted-turns")).toEqual([]);
  });

  it("flags three quarter turns in a row as one turn done in three", () => {
    const report = analyzeMistakes(solve(["R D D D R'"]));
    const wasted = report.mistakes.filter((m) => m.kind === "wasted-turns");
    expect(wasted).toHaveLength(1);
    expect(wasted[0].detail).toMatch(/D D D is just D' done in 3/);
  });
});

describe("aggregateMistakes", () => {
  it("ranks habits by total cost and counts affected solves once each", () => {
    const a = analyzeMistakes(solve(["R R' D R D2 D"]));
    const b = analyzeMistakes(solve(["R D R' D'", SUNE, `D ${SUNE}`]));
    const habits = aggregateMistakes([a, b]);
    expect(habits[0].kind).toBe("extra-oll-look");
    const wasted = habits.find((h) => h.kind === "wasted-turns")!;
    expect(wasted.occurrences).toBe(2);
    expect(wasted.solvesAffected).toBe(1);
    expect(wasted.costPerSolveMs).toBeCloseTo(wasted.totalCostMs / 2);
  });
});

function saved(id: string, phrases: string[], date: number): Solve {
  const { scramble, moves, timesMs, totalMs } = solve(phrases);
  return { id, sessionId: "x", penalty: "none", scramble, reconstruction: moves.join(" "), moveTimestamps: timesMs, timeMs: totalMs, date };
}

describe("mistakeHabits", () => {
  it("replays saved solves and rolls their mistakes into habits, oldest data first", () => {
    const twoLookOll = ["R D R' D'", SUNE, `D ${SUNE}`];
    const solves = [0, 1, 2].map((k) => saved(`s${k}`, twoLookOll, k * 60_000));
    const habits = mistakeHabits(solves);
    const extra = habits.find((h) => h.kind === "extra-oll-look")!;
    expect(extra.solvesAffected).toBe(3);
    expect(extra.occurrences).toBe(3);
  });

  it("skips dnf and keyboard (no-reconstruction) solves, without throwing", () => {
    const dnf: Solve = { ...saved("d", ["R D R' D'"], 0), penalty: "dnf" };
    const keyboard: Solve = { id: "k", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 0 };
    expect(() => mistakeHabits([dnf, keyboard])).not.toThrow();
    expect(mistakeHabits([dnf, keyboard])).toEqual([]);
    expect(mistakeHabits([])).toEqual([]);
  });
});
