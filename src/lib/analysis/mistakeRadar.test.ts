import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { LOOK_PAUSE_MAX_MS, LOOK_PAUSE_MS, aggregateMistakes, analyzeMistakes, lookPauseMs, mistakeHabits, unionCostMs } from "./mistakeRadar";

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

describe("what the mistakes cost in total", () => {
  it("counts a stretch once however many mistakes overlap it", () => {
    expect(unionCostMs([])).toBe(0);
    expect(unionCostMs([{ atMs: 100, costMs: 0 }])).toBe(0);
    // Disjoint: they add.
    expect(unionCostMs([{ atMs: 0, costMs: 100 }, { atMs: 500, costMs: 200 }])).toBe(300);
    // Overlapping and nested (given out of order): one stretch, 100 to 700.
    expect(
      unionCostMs([
        { atMs: 400, costMs: 300 },
        { atMs: 100, costMs: 400 },
        { atMs: 200, costMs: 50 },
      ]),
    ).toBe(600);
    // Touching spans neither gap nor double-count.
    expect(unionCostMs([{ atMs: 0, costMs: 100 }, { atMs: 100, costMs: 100 }])).toBe(200);
  });

  it("prices a knocked pair and the wasted turns inside its rebuild as one stretch", () => {
    // The knocked-pair solve, with a cancelling B B' while the pair is being rebuilt.
    const input = solve(["R D R' D' L' D' L D R D2 R' B B' D B D' B' D' R D' R' D2 F D F'"]);
    const report = analyzeMistakes(input);
    const knocked = report.mistakes.find((m) => m.kind === "pair-knocked")!;
    const wasted = report.mistakes.find((m) => m.kind === "wasted-turns")!;
    expect(knocked).toBeDefined();
    expect(wasted).toBeDefined();
    expect(wasted.atMs).toBeGreaterThan(knocked.atMs);
    expect(wasted.atMs + wasted.costMs).toBeLessThanOrEqual(knocked.atMs + knocked.costMs);
    // Per-mistake costs are still shown as they are; the total is the knocked pair's span alone.
    expect(wasted.costMs).toBeGreaterThan(0);
    expect(report.totalCostMs).toBe(knocked.costMs);
    expect(report.totalCostMs).toBeLessThan(report.mistakes.reduce((a, m) => a + m.costMs, 0));
    expect(report.potentialMs).toBe(input.totalMs - knocked.costMs);
  });

  it("derives the clean score from the union, never below zero", () => {
    const input = solve(["R D R' D' L' D' L D R D2 R' B B' D B D' B' D' R D' R' D2 F D F'"]);
    const report = analyzeMistakes(input);
    expect(report.cleanScore).toBe(Math.round(100 * (1 - report.totalCostMs / input.totalMs)));
    expect(report.cleanScore).toBeGreaterThanOrEqual(0);
  });
});

describe("the look pause", () => {
  const evenly = (n: number, gap: number) => Array.from({ length: n }, (_, i) => i * gap);

  it("stays the flat 350 ms for a quick turner and for a solve with too little data", () => {
    expect(lookPauseMs(evenly(60, 100))).toBe(LOOK_PAUSE_MS);
    expect(lookPauseMs(evenly(60, 140))).toBe(LOOK_PAUSE_MS);
    expect(lookPauseMs(evenly(8, 600))).toBe(LOOK_PAUSE_MS);
    expect(lookPauseMs([])).toBe(LOOK_PAUSE_MS);
  });

  it("scales with a slower turner's own median gap, up to a ceiling", () => {
    expect(lookPauseMs(evenly(60, 300))).toBe(750);
    expect(lookPauseMs(evenly(60, 900))).toBe(LOOK_PAUSE_MAX_MS);
  });

  it("is not thrown off by the pauses themselves (it uses the median)", () => {
    const times = evenly(60, 100);
    for (let i = 20; i < 60; i += 5) for (let j = i; j < 60; j++) times[j] += 500;
    expect(lookPauseMs(times)).toBe(LOOK_PAUSE_MS);
  });

  it("does not read a slow solver's ordinary pause between algorithms as an extra look", () => {
    const phrases = ["R D R' D'", SUNE, `D ${SUNE}`];
    // 300 ms between turns, 700 ms between phrases: a look for a fast turner, ordinary rhythm for this one.
    const slow = analyzeMistakes(solve(phrases, 300, 400));
    expect(slow.mistakes.filter((m) => m.kind === "extra-oll-look")).toEqual([]);
    // The same solve at a quick pace still has the extra look; a long pause for a slow turner is still a look.
    expect(analyzeMistakes(solve(phrases, 120, 700)).mistakes.filter((m) => m.kind === "extra-oll-look")).toHaveLength(1);
    expect(analyzeMistakes(solve(phrases, 300, 900)).mistakes.filter((m) => m.kind === "extra-oll-look")).toHaveLength(1);
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
