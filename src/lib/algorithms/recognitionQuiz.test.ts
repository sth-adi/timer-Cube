import { describe, expect, it } from "vitest";
import { PLL_CASES } from "./pllData";
import { OLL_CASES } from "./ollData";
import { buildRecognitionQuestion, pickRandomCase, pickWeightedCase, weakFocusWeight } from "./recognitionQuiz";
import { initialProgress, applyReview } from "./srs";
import type { AlgCase } from "./types";

const ALL_CASES: AlgCase[] = [...PLL_CASES, ...OLL_CASES];

describe("recognitionQuiz", () => {
  it("pickRandomCase restricts to the requested group", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickRandomCase(ALL_CASES, "PLL").group).toBe("PLL");
      expect(pickRandomCase(ALL_CASES, "OLL").group).toBe("OLL");
    }
  });

  it("builds exactly 4 unique choices including the correct case, every time", () => {
    for (const correct of ALL_CASES) {
      const q = buildRecognitionQuestion(ALL_CASES, correct);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
      expect(q.choices.some((c) => c.id === correct.id)).toBe(true);
    }
  });

  it("never offers a distractor from the other group", () => {
    for (const correct of ALL_CASES) {
      const q = buildRecognitionQuestion(ALL_CASES, correct);
      expect(q.choices.every((c) => c.group === correct.group)).toBe(true);
    }
  });

  it("prefers same-shape OLL distractors when enough exist", () => {
    // Every OLL shape family (Dot, L Shape, Line, Cross) has well over 3
    // members, so a same-shape-family question should never need to fall
    // back to a cross-family distractor.
    const dot = OLL_CASES.find((c) => c.shape === "Dot")!;
    const q = buildRecognitionQuestion(ALL_CASES, dot);
    const distractors = q.choices.filter((c) => c.id !== dot.id);
    expect(distractors.every((c) => c.shape === "Dot")).toBe(true);
  });

  describe("weakFocusWeight", () => {
    it("weighs a never-seen case moderately", () => {
      expect(weakFocusWeight(undefined)).toBe(3);
    });

    it("weighs a lapsed, low-ease case higher than a clean one", () => {
      let struggled = initialProgress("x");
      struggled = applyReview(struggled, "again");
      struggled = applyReview(struggled, "again");
      const clean = applyReview(initialProgress("y"), "easy");
      expect(weakFocusWeight(struggled)).toBeGreaterThan(weakFocusWeight(clean));
    });
  });

  describe("pickWeightedCase", () => {
    it("overwhelmingly favors the one heavily-weighted case (weights are floored, not zeroed, so this is near-certain rather than guaranteed)", () => {
      const target = ALL_CASES[3];
      let hits = 0;
      for (let i = 0; i < 50; i++) {
        const picked = pickWeightedCase(ALL_CASES, (id) => (id === target.id ? 10_000 : 0));
        if (picked.id === target.id) hits++;
      }
      expect(hits).toBeGreaterThan(45);
    });

    it("restricts to the requested group", () => {
      for (let i = 0; i < 20; i++) {
        expect(pickWeightedCase(ALL_CASES, () => 1, "PLL").group).toBe("PLL");
      }
    });
  });
});
