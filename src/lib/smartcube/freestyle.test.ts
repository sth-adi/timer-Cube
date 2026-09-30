import { beforeAll, describe, expect, it } from "vitest";
import { cubeFromAlg, ensureSolverReady } from "../cube-engine/engine";
import { computeCorrectiveMoves } from "../analysis/scrambleVerify";
import { FREESTYLE_MIN_SOLUTION, judgeShuffle, scrambleFromSolution, scrambleReproduces } from "./freestyle";

// The two-phase solver's first search can run long on a busy machine.
const SOLVER_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  await ensureSolverReady();
}, SOLVER_TIMEOUT_MS);

describe("scrambleFromSolution", () => {
  it("inverts and reverses", () => {
    expect(scrambleFromSolution(["R", "U2", "F'"])).toBe("F U2 R'");
    expect(scrambleFromSolution([])).toBe("");
  });
});

describe("a hand shuffle becomes a faithful scramble", () => {
  const shuffles = [
    "R U F' L2 D B' R2 U' F L' D2 B U R' F2 L D' B2 U2 R",
    "F R' U2 L D' B R2 F' U L2 D B' R U' F2 L' D2 B U R2 F",
    "U2 B' L R2 F D' U B2 L' R F2 D U' B R' L2 F' D2 U B",
  ];
  for (const shuffle of shuffles) {
    it(`reproduces the exact state of: ${shuffle}`, () => {
      const facelets = cubeFromAlg(shuffle).asString();
      // The same call the app makes: the solution to the state, from a solved reference.
      const solution = computeCorrectiveMoves("", facelets);
      const verdict = judgeShuffle(facelets, solution);
      expect(verdict.kind).not.toBe("invalid");
      if (verdict.kind === "invalid") return;
      expect(scrambleReproduces(verdict.scramble, facelets)).toBe(true);
    }, SOLVER_TIMEOUT_MS);
  }
});

describe("judgeShuffle", () => {
  it("flags a shuffle that's only a few moves from solved, but still hands back its scramble", () => {
    const shuffle = "R U R' U'";
    const facelets = cubeFromAlg(shuffle).asString();
    const solution = computeCorrectiveMoves("", facelets);
    const verdict = judgeShuffle(facelets, solution);
    expect(verdict.kind).toBe("easy");
    if (verdict.kind === "easy") {
      expect(verdict.moves).toBeLessThan(FREESTYLE_MIN_SOLUTION);
      expect(scrambleReproduces(verdict.scramble, facelets)).toBe(true);
    }
  }, SOLVER_TIMEOUT_MS);

  it("rejects a solution that doesn't actually solve the state", () => {
    const facelets = cubeFromAlg("R U F' L2 D B' R2 U' F L' D2 B").asString();
    expect(judgeShuffle(facelets, ["R", "U"]).kind).toBe("invalid");
  });

  it("accepts a properly mixed cube", () => {
    const facelets = cubeFromAlg("R U F' L2 D B' R2 U' F L' D2 B U R' F2 L D' B2 U2 R").asString();
    const solution = computeCorrectiveMoves("", facelets);
    expect(judgeShuffle(facelets, solution).kind).toBe("ok");
  }, SOLVER_TIMEOUT_MS);
});
