import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { predictSolveTime } from "./prediction";
import { computeScrambleFeatures, featureVector } from "./scrambleFeatures";

/** Cheap pseudo-random scramble generator for test fixtures — doesn't need to be WCA-legal, just varied. */
function makeScramble(seed: number, length: number): string {
  const faces = ["U", "D", "L", "R", "F", "B"];
  const suffixes = ["", "'", "2"];
  let x = seed;
  const rand = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x;
  };
  const moves: string[] = [];
  for (let i = 0; i < length; i++) {
    moves.push(faces[rand() % faces.length] + suffixes[rand() % suffixes.length]);
  }
  return moves.join(" ");
}

const SCRAMBLES = Array.from({ length: 20 }, (_, i) => makeScramble(i + 1, 18));

function makeSolve(id: string, scramble: string, timeMs: number, overrides: Partial<Solve> = {}): Solve {
  return {
    id,
    sessionId: "s1",
    timeMs,
    penalty: "none",
    scramble,
    date: Date.now(),
    ...overrides,
  };
}

describe("predictSolveTime", () => {
  it("returns null with too little history", () => {
    const solves = SCRAMBLES.slice(0, 3).map((s, i) => makeSolve(`${i}`, s, 10000));
    expect(predictSolveTime(solves, SCRAMBLES[0])).toBeNull();
  });

  it("returns null for an empty scramble", () => {
    const solves = SCRAMBLES.map((s, i) => makeSolve(`${i}`, s, 10000));
    expect(predictSolveTime(solves, "")).toBeNull();
  });

  it("predicts once there's enough history, but withholds the PB chance until it has been checked", () => {
    const solves = SCRAMBLES.map((s, i) => makeSolve(`${i}`, s, 8000 + i * 200));
    const result = predictSolveTime(solves, SCRAMBLES[0]);
    expect(result).not.toBeNull();
    expect(result!.predictedMs).toBeGreaterThan(0);
    // 20 solves is enough to fit, not enough to backtest on later solves.
    expect(result!.skill).toBeNull();
    expect(result!.pbProbability).toBeNull();
  });

  it("ignores DNFs when finding the current PB and when training", () => {
    const solves = SCRAMBLES.map((s, i) => makeSolve(`${i}`, s, 8000 + i * 200));
    solves.push(makeSolve("dnf", SCRAMBLES[0], 5000, { penalty: "dnf" }));
    const result = predictSolveTime(solves, SCRAMBLES[0]);
    expect(result).not.toBeNull();
    // The DNF'd 5s solve must not have pulled the PB below the real best.
    const finiteTimes = solves.filter((s) => s.penalty !== "dnf").map((s) => s.timeMs);
    const realBest = Math.min(...finiteTimes);
    expect(result!.pbProbability).toBe(
      predictSolveTime(
        solves.filter((s) => s.penalty !== "dnf"),
        SCRAMBLES[0],
      )!.pbProbability,
    );
    expect(realBest).toBe(8000);
  });

  describe("backtest against your recent average", () => {
    const many = Array.from({ length: 60 }, (_, i) => makeScramble(i + 101, 20));
    let x = 7;
    const noise = () => ((x = (x * 16807) % 2147483647) / 2147483647 - 0.5) * 2; // −1..1

    it("shows the PB chance when scrambles really do explain your times", () => {
      const solves = many.map((s, i) => {
        const [crossLen] = featureVector(computeScrambleFeatures(s));
        return makeSolve(`${i}`, s, 9000 + crossLen * 900 + noise() * 150, { date: i });
      });
      const result = predictSolveTime(solves, many[0])!;
      expect(result.skill!.useful).toBe(true);
      expect(result.skill!.modelMaeMs).toBeLessThan(result.skill!.baselineMaeMs);
      expect(result.pbProbability).not.toBeNull();
    });

    it("hides it when times are unrelated to the scramble", () => {
      const solves = many.map((s, i) => makeSolve(`${i}`, s, 11_000 + noise() * 1500, { date: i }));
      const result = predictSolveTime(solves, many[0])!;
      expect(result.skill).not.toBeNull();
      expect(result.skill!.useful).toBe(false);
      expect(result.pbProbability).toBeNull();
    });
  });
});
