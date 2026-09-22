import { describe, expect, it } from "vitest";
import { DOUBLE_TURN_MERGE_WINDOW_MS, mergesIntoDoubleTurn } from "./doubleTurns";

describe("mergesIntoDoubleTurn", () => {
  it("merges two same-face, same-direction quarter turns thrown quickly", () => {
    expect(mergesIntoDoubleTurn("R", 1000, "R", 1000 + DOUBLE_TURN_MERGE_WINDOW_MS)).toBe(true);
    expect(mergesIntoDoubleTurn("U'", 1000, "U'", 1050)).toBe(true);
  });

  it("does not merge across the time window — a real recognition pause, not a double flip", () => {
    expect(mergesIntoDoubleTurn("R", 1000, "R", 1000 + DOUBLE_TURN_MERGE_WINDOW_MS + 1)).toBe(false);
  });

  it("does not merge opposite-direction pairs — a regrip/correction, not a double turn", () => {
    expect(mergesIntoDoubleTurn("R", 1000, "R'", 1050)).toBe(false);
  });

  it("does not merge different faces", () => {
    expect(mergesIntoDoubleTurn("R", 1000, "U", 1050)).toBe(false);
  });

  it("never re-merges an already-atomic half turn", () => {
    expect(mergesIntoDoubleTurn("R2", 1000, "R2", 1050)).toBe(false);
  });

  it("has nothing to merge against for the very first move", () => {
    expect(mergesIntoDoubleTurn(undefined, undefined, "R", 1000)).toBe(false);
  });
});
