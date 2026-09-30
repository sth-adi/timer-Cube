import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "../cube-engine/engine";
import { MAX_EXACT_PAR, countStrokes, generateHole, optimalSolution, scoreLabel, solves } from "./golf";

const sol = (alg: string) => optimalSolution(cubeFromAlg(alg));

describe("optimalSolution", () => {
  it("is empty for a solved cube", () => {
    expect(sol("")).toEqual([]);
  });

  it("finds one-move and two-move fixes", () => {
    expect(sol("R")?.length).toBe(1);
    expect(sol("U2")?.length).toBe(1);
    expect(sol("R U")?.length).toBe(2);
    // Opposite faces commute and half turns are one move: still 2.
    expect(sol("R2 L2")?.length).toBe(2);
  });

  it("never reports longer than the scramble, and always actually solves it", () => {
    const scrambles = [
      "R U R' U'",
      "F R U R' U' F'",
      "R U R' U' R U R' U'",
      "D2 L' B U2 R F' D",
      "U F2 L' D B2 R U' F",
      "B' D2 R U' L2 F D' R2",
    ];
    for (const s of scrambles) {
      const moves = s.split(" ");
      const solution = sol(s);
      expect(solution, s).not.toBeNull();
      expect(solution!.length, s).toBeLessThanOrEqual(moves.length);
      expect(solves(moves, solution!), s).toBe(true);
    }
  });

  it("is exactly optimal: a position at depth 5 can't be solved in 4", () => {
    // Five distinct-axis turns can't fold down; the found optimum must be 5.
    const s = "R U F D L";
    const solution = sol(s)!;
    expect(solution.length).toBe(5);
  });

  it("finds the shorter way when a scramble isn't optimal", () => {
    // R L R' L' style tangles that collapse: the scramble below is R then R' in disguise across a commuting face.
    expect(sol("R L R'")?.length).toBe(1);
  });

  it("gives up honestly past the exact range", () => {
    const far = "R U R' U' R U R' U' R U R' U' R U R' U'";
    expect(sol(far) === null || sol(far)!.length <= MAX_EXACT_PAR).toBe(true);
    // A position ~20 from solved is out of reach.
    expect(sol("R U2 F' D L2 B U' R2 F D' L B2 U R' F2 D L' B U2")).toBeNull();
  });
});

describe("generateHole", () => {
  for (let par = 2; par <= 7; par++) {
    it(`par ${par}: the scramble's true optimum is exactly ${par} and the solution solves it`, () => {
      const hole = generateHole(par, 1234 + par);
      expect(hole.par).toBe(par);
      expect(hole.scramble).toHaveLength(par);
      expect(hole.solution).toHaveLength(par);
      expect(solves(hole.scramble, hole.solution)).toBe(true);
      // And nothing shorter exists.
      expect(optimalSolution(cubeFromAlg(hole.scramble.join(" ")))!.length).toBe(par);
    });
  }

  it("is deterministic for a seed and varied across seeds", { timeout: 60_000 }, () => {
    expect(generateHole(4, 9).scramble).toEqual(generateHole(4, 9).scramble);
    const seen = new Set(Array.from({ length: 12 }, (_, i) => generateHole(4, i + 1).scramble.join(" ")));
    expect(seen.size).toBeGreaterThan(6);
  });

  it("rejects pars it can't prove", () => {
    expect(() => generateHole(1, 1)).toThrow();
    expect(() => generateHole(MAX_EXACT_PAR + 1, 1)).toThrow();
  });
});

describe("countStrokes", () => {
  it("counts simplified turns", () => {
    expect(countStrokes([])).toBe(0);
    expect(countStrokes(["R", "U", "F"])).toBe(3);
    expect(countStrokes(["R", "R"])).toBe(1); // R2
    expect(countStrokes(["R", "R'"])).toBe(0); // cancels
    expect(countStrokes(["R", "R", "R"])).toBe(1); // R'
    expect(countStrokes(["R", "L", "R'"])).toBe(1); // R and R' meet across the commuting L
    expect(countStrokes(["R", "U", "R'"])).toBe(3); // U is between them — no merge
  });
  it("can never beat par: a solving sequence is at least as long as the optimum", () => {
    const hole = generateHole(5, 77);
    // Wander, then solve: extra detours only add strokes.
    const detour = ["U", "U'", ...hole.solution.flatMap((t) => (t.endsWith("2") ? [t[0], t[0]] : [t]))];
    expect(countStrokes(detour)).toBeGreaterThanOrEqual(hole.par);
  });
});

describe("scoreLabel", () => {
  it("reads par and overs", () => {
    expect(scoreLabel(5, 5)).toMatch(/^Par/);
    expect(scoreLabel(6, 5)).toBe("One over");
    expect(scoreLabel(9, 5)).toBe("4 over");
  });
});
