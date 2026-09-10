import { beforeAll, describe, expect, it } from "vitest";
import { cubeFromAlg, ensureSolverReady } from "../cube-engine/engine";
import { computeCorrectiveMoves, isScrambleComplete, targetFacelets } from "./scrambleVerify";

beforeAll(() => {
  ensureSolverReady();
});

describe("targetFacelets / isScrambleComplete", () => {
  it("matches the live facelets of a cube that actually did the scramble", () => {
    const scramble = "R U R' U' F2 D' L2 B";
    const live = cubeFromAlg(scramble).asString();
    expect(isScrambleComplete(live, scramble)).toBe(true);
    expect(live).toBe(targetFacelets(scramble));
  });

  it("does not match a cube that did something else", () => {
    const scramble = "R U R' U' F2 D' L2 B";
    const wrongLive = cubeFromAlg("R U R' U'").asString();
    expect(isScrambleComplete(wrongLive, scramble)).toBe(false);
  });

  it("the solved cube never matches a non-trivial scramble", () => {
    expect(isScrambleComplete(cubeFromAlg("").asString(), "R U R' U'")).toBe(false);
  });
});

describe("computeCorrectiveMoves", () => {
  function applyAndCheck(scramble: string, actualMoves: string) {
    const actualFacelets = cubeFromAlg(actualMoves).asString();
    const corrective = computeCorrectiveMoves(scramble, actualFacelets);
    const resultAlg = `${actualMoves} ${corrective.join(" ")}`.trim();
    const resultFacelets = cubeFromAlg(resultAlg).asString();
    expect(resultFacelets).toBe(targetFacelets(scramble));
    return corrective;
  }

  it("returns the whole scramble when nothing has been turned yet", () => {
    const corrective = applyAndCheck("R U", "");
    expect(corrective.join(" ")).toBe("R U");
  });

  it("returns nothing once the scramble is already matched exactly", () => {
    const corrective = applyAndCheck("R U", "R U");
    expect(corrective).toEqual([]);
  });

  it("returns the remaining moves for a correct partial scramble", () => {
    const corrective = applyAndCheck("R U", "R");
    expect(corrective.join(" ")).toBe("U");
  });

  it("finds a correction after a genuinely wrong move, and it's not the scramble tacked on unmodified", () => {
    // Did U instead of starting with R — needs to undo U, then do R.
    const corrective = applyAndCheck("R", "U");
    expect(corrective.join(" ")).toBe("U' R");
  });

  it(
    "still finds a valid correction for a long, realistic scramble gone wrong partway through",
    () => {
      const scramble = "R U R' U' F2 D' L2 B R2 U2 F' L' B2 D R U' F2";
      // Correct for the first several moves, then a wrong move.
      const actualMoves = "R U R' U' F2 D' L2 B R2 U2 F L'";
      applyAndCheck(scramble, actualMoves);
    },
    10_000,
  );

  it(
    "round-trips a scramble unrelated to what was actually done at all",
    () => {
      applyAndCheck("R2 F2 U2 B' D' L2 U' F2 R' B2 L D2 F R U' L' B'", "B B B U U U");
    },
    10_000,
  );
});
