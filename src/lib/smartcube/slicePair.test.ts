import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { mergeSlicePairs, slicePairLabel, SLICE_PAIR_WINDOW_MS } from "./slicePair";

const ROTATIONS = ["", "x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"];

/** Whether `raw` (two real quarter/half turns) is the same physical move as `label` — allowing for the engine's own M/E/S tokens bundling in a whole-cube reorientation (see slicePair.ts's doc comment): true if *any* single rotation before or after `label` reproduces `raw`'s exact resulting state. */
function isSameMove(raw: string, label: string): boolean {
  const target = newCube();
  target.move(raw);
  const targetState = target.asString();
  for (const pre of ROTATIONS) {
    for (const post of ROTATIONS) {
      const c = newCube();
      c.move([pre, label, post].filter(Boolean).join(" "));
      if (c.asString() === targetState) return true;
    }
  }
  return false;
}

describe("slicePairLabel", () => {
  const pairs: [string, string, string][] = [
    ["R", "L'", "M"],
    ["L'", "R", "M"],
    ["L", "R'", "M'"],
    ["R'", "L", "M'"],
    ["R2", "L2", "M2"],
    ["U", "D'", "E"],
    ["D'", "U", "E"],
    ["D", "U'", "E'"],
    ["U2", "D2", "E2"],
    ["F", "B'", "S'"],
    ["B'", "F", "S'"],
    ["B", "F'", "S"],
    ["F2", "B2", "S2"],
  ];

  it.each(pairs)("reads %s, %s as %s — the physically correct move, whatever the engine's own token bundles in", (a, b, label) => {
    expect(slicePairLabel(a, 1000, b, 1010)).toBe(label);
    expect(isSameMove(`${a} ${b}`, label)).toBe(true);
  });

  it("only fires for opposite faces landing within the window", () => {
    expect(slicePairLabel("R", 1000, "R'", 1010)).toBeNull(); // same face
    expect(slicePairLabel("R", 1000, "U", 1010)).toBeNull(); // not an opposite pair
    expect(slicePairLabel("R", 1000, "L'", 1000 + SLICE_PAIR_WINDOW_MS + 1)).toBeNull(); // too slow
    expect(slicePairLabel("R", 1000, "L'", 1000 + SLICE_PAIR_WINDOW_MS)).toBe("M"); // right at the edge
  });
});

describe("mergeSlicePairs", () => {
  it("merges only a genuine same-instant opposite pair, leaving ordinary turns alone", () => {
    const moves = [
      { token: "U", timeStampMs: 0 },
      { token: "R", timeStampMs: 100 },
      { token: "L'", timeStampMs: 110 },
      { token: "F", timeStampMs: 400 },
    ];
    expect(mergeSlicePairs(moves).map((m) => m.token)).toEqual(["U", "M", "F"]);
  });

  it("leaves a real pair of separate turns alone when they're too slow to be one notification", () => {
    const moves = [
      { token: "R", timeStampMs: 0 },
      { token: "L'", timeStampMs: 1000 },
    ];
    expect(mergeSlicePairs(moves).map((m) => m.token)).toEqual(["R", "L'"]);
  });

  it("doesn't reuse a move across two merges", () => {
    // Three quick opposite-face turns in a row: only the first pair is one notation move,
    // the third is left as its own turn (there's no fourth to pair it with).
    const moves = [
      { token: "R", timeStampMs: 0 },
      { token: "L'", timeStampMs: 10 },
      { token: "R", timeStampMs: 20 },
    ];
    expect(mergeSlicePairs(moves).map((m) => m.token)).toEqual(["M", "R"]);
  });
});
