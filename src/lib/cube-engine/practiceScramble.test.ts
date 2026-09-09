import { describe, expect, it } from "vitest";
import { generatePracticeScramble } from "./practiceScramble";

const FACE_OF: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

describe("generatePracticeScramble", () => {
  it("produces exactly the requested number of moves", () => {
    for (const length of [1, 12, 25, 40]) {
      expect(generatePracticeScramble(length).trim().split(/\s+/)).toHaveLength(length);
    }
  });

  it("never repeats the same face or same axis on consecutive moves", () => {
    // Run many times since it's random — a flaky adjacency would show up
    // eventually over enough trials.
    for (let trial = 0; trial < 50; trial++) {
      const moves = generatePracticeScramble(60).split(" ");
      for (let i = 1; i < moves.length; i++) {
        const prevFace = FACE_OF[moves[i - 1][0]];
        const face = FACE_OF[moves[i][0]];
        expect(face).not.toBe(prevFace);
        expect(face % 3).not.toBe(prevFace % 3);
      }
    }
  });

  it("produces only valid move tokens", () => {
    const moves = generatePracticeScramble(30).split(" ");
    for (const m of moves) expect(m).toMatch(/^[URFDLB](2|')?$/);
  });

  it("handles length 0", () => {
    expect(generatePracticeScramble(0)).toBe("");
  });
});
