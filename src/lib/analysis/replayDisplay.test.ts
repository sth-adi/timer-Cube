import { describe, expect, it } from "vitest";
import { mergeSlicePairs } from "@/lib/smartcube/slicePair";
import { displayIndexForMove, displayMoves } from "./replayDisplay";
import { activeLeaf, buildTimeline } from "./replayTiming";

// R U | R' L (landing together = an M) | D | U2 D2 (together = E2) | F
const TOKENS = ["R", "U", "R'", "L", "D", "U2", "D2", "F"];
const TIMES = [0, 200, 400, 402, 700, 900, 903, 1200];

describe("displayMoves", () => {
  it("merges a same-instant opposite-face pair into the slice move, as the recap does", () => {
    const d = displayMoves(TOKENS, TIMES);
    // R' L is M' (see slicePair.ts's table); U2 D2 is E2
    expect(d.map((x) => x.token)).toEqual(["R", "U", "M'", "D", "E2", "F"]);
  });

  it("reads exactly the same tokens as the recap's mergeSlicePairs", () => {
    const recap = mergeSlicePairs(TOKENS.map((token, i) => ({ token, timeStampMs: TIMES[i] }))).map((m) => m.token);
    expect(displayMoves(TOKENS, TIMES).map((x) => x.token)).toEqual(recap);
  });

  it("matches the recap for every pair spelling, in either arrival order", () => {
    const pairs = [["R", "L'"], ["L'", "R"], ["L", "R'"], ["R'", "L"], ["R2", "L2"], ["U", "D'"], ["D", "U'"], ["F", "B'"], ["B", "F'"], ["F2", "B2"]];
    for (const [a, b] of pairs) {
      const moves = [{ token: "U", timeStampMs: 0 }, { token: a, timeStampMs: 100 }, { token: b, timeStampMs: 105 }, { token: "U", timeStampMs: 400 }];
      expect(displayMoves(moves.map((m) => m.token), moves.map((m) => m.timeStampMs)).map((x) => x.token)).toEqual(
        mergeSlicePairs(moves).map((m) => m.token),
      );
    }
  });

  it("records which raw moves each token covers, so nothing is lost or double counted", () => {
    const d = displayMoves(TOKENS, TIMES);
    expect(d.map((x) => [x.first, x.last])).toEqual([[0, 0], [1, 1], [2, 3], [4, 4], [5, 6], [7, 7]]);
    // every raw move belongs to exactly one display token
    const covered = d.flatMap((x) => Array.from({ length: x.last - x.first + 1 }, (_, k) => x.first + k));
    expect(covered).toEqual(TOKENS.map((_, i) => i));
  });

  it("leaves opposite-face turns that did not land together alone", () => {
    const d = displayMoves(["R", "L'"], [0, 300]);
    expect(d.map((x) => x.token)).toEqual(["R", "L'"]);
  });

  it("shows raw tokens when there is no timing to tell a pair from two real turns", () => {
    expect(displayMoves(TOKENS).map((x) => x.token)).toEqual(TOKENS);
    expect(displayMoves(TOKENS, TIMES.slice(1)).map((x) => x.token)).toEqual(TOKENS);
    expect(displayMoves([], []).length).toBe(0);
  });
});

describe("current-move highlight on merged tokens", () => {
  const d = displayMoves(TOKENS, TIMES);

  it("maps a raw move index to the display token holding it, with both halves of a pair on the merged token", () => {
    expect(displayIndexForMove(d, -1)).toBe(-1);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => displayIndexForMove(d, i))).toEqual([0, 1, 2, 2, 3, 4, 4, 5]);
    expect(displayIndexForMove(d, 99)).toBe(-1);
  });

  it("follows playback: as the timeline advances the lit token steps through the merged text, never skipping or lagging", () => {
    const gaps = TIMES.map((t, i) => t - (TIMES[i - 1] ?? 0));
    const tl = buildTimeline(gaps, { realPauses: true });
    const lit: number[] = [];
    for (let t = 0; t <= tl.durationMs; t += 10) {
      const idx = displayIndexForMove(d, activeLeaf(tl.starts, t));
      if (lit[lit.length - 1] !== idx) lit.push(idx);
    }
    // before anything plays nothing is lit, then each display token once, in order
    expect(lit).toEqual([-1, 0, 1, 2, 3, 4, 5]);
  });

  it("lights the merged token as soon as the first half of the pair starts turning", () => {
    const tl = buildTimeline(TIMES.map((t, i) => t - (TIMES[i - 1] ?? 0)), { realPauses: true });
    expect(displayIndexForMove(d, activeLeaf(tl.starts, tl.starts[2] + 1))).toBe(2);
    expect(displayIndexForMove(d, activeLeaf(tl.starts, tl.starts[3] + 1))).toBe(2);
    expect(displayIndexForMove(d, activeLeaf(tl.starts, tl.starts[4] + 1))).toBe(3);
  });
});
