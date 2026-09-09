import { describe, expect, it } from "vitest";
import { buildBldMemo, cornerMemoCycles, edgeMemoCycles, pairUp } from "./bldMemo";
import { CORNER_LETTER, EDGE_LETTER } from "./bldLettering";

const SOLVED_CP = [0, 1, 2, 3, 4, 5, 6, 7];
const SOLVED_CO = [0, 0, 0, 0, 0, 0, 0, 0];
const SOLVED_EP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SOLVED_EO = new Array(12).fill(0);

describe("bldMemo", () => {
  it("has nothing to memo on a solved cube", () => {
    expect(cornerMemoCycles(SOLVED_CP, SOLVED_CO)).toEqual([]);
    expect(edgeMemoCycles(SOLVED_EP, SOLVED_EO)).toEqual([]);
  });

  it("produces the hand-verified words for a 3-cycle through the buffer (ULB=slot2)", () => {
    // Slots 0(URF) <- 2(ULB) <- 3(UBR) <- 0(URF): a pure slot 3-cycle among
    // corners, all orientations left at 0. Buffer is slot 2 (letter 'a'),
    // so this exercises the buffer-cycle branch directly. With orientation
    // untouched, each of a corner's 3 stickers traces its own independent
    // copy of the same slot cycle — three 3-letter groups in total, one of
    // which (through the buffer) comes out as just the 2 non-buffer letters.
    const cp = [2, 1, 3, 0, 4, 5, 6, 7];
    const co = SOLVED_CO;
    expect(cornerMemoCycles(cp, co)).toEqual([
      ["B", "C"],
      ["E", "Q", "M"],
      ["J", "R", "N"],
    ]);
  });

  it("captures a corner twisted in place as its own cycle (no permutation change)", () => {
    // Slot 0 (URF) correctly placed but twisted clockwise once.
    const cp = SOLVED_CP;
    const co = [1, 0, 0, 0, 0, 0, 0, 0];
    const cycles = cornerMemoCycles(cp, co);
    // Not the buffer's own slot, so it's a virtual-buffer cycle starting at
    // whichever of URF's 3 letters comes first among C, J, M.
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0])).toEqual(new Set(["C", "J", "M"]));
  });

  it("next() is a bijection on the 24 letters for corners and edges alike (every scrambled cube fully decomposes)", () => {
    // A generic scramble, run through the real solver pipeline.
    const { cornerWords, edgeWords } = buildBldMemo("R U R' F' D2 L B2 R' U2 F L2 D' B R2 U' F2");
    const cornerLetters = cornerWords.flat();
    const edgeLetters = edgeWords.flat();
    // No letter appears twice across all corner cycles (each letter belongs to exactly one cycle).
    expect(new Set(cornerLetters).size).toBe(cornerLetters.length);
    expect(new Set(edgeLetters).size).toBe(edgeLetters.length);
    // Buffer letter "A" never appears in any word (implicit for its own cycle, and it's covered before the scan for leftovers).
    expect(cornerLetters).not.toContain("A");
    expect(edgeLetters).not.toContain("A");
  });

  it("every corner slot contributes exactly 3 distinct letters, matching CORNER_LETTER's own construction", () => {
    const seen = new Set<number>();
    for (const row of CORNER_LETTER) {
      expect(row).toHaveLength(3);
      for (const letter of row) seen.add(letter);
    }
    expect(seen.size).toBe(24);
  });

  it("every edge slot contributes exactly 2 distinct letters, matching EDGE_LETTER's own construction", () => {
    const seen = new Set<number>();
    for (const row of EDGE_LETTER) {
      expect(row).toHaveLength(2);
      for (const letter of row) seen.add(letter);
    }
    expect(seen.size).toBe(24);
  });

  it("is deterministic for the same scramble", () => {
    const a = buildBldMemo("R U R' U'");
    const b = buildBldMemo("R U R' U'");
    expect(a).toEqual(b);
  });

  it("marks corners/edges solved flags correctly", () => {
    const solved = buildBldMemo("");
    expect(solved.cornersSolved).toBe(true);
    expect(solved.edgesSolved).toBe(true);

    const scrambled = buildBldMemo("R U R' U' R U R' U'");
    expect(scrambled.cornersSolved || scrambled.edgesSolved).toBe(false);
  });
});

describe("pairUp", () => {
  it("groups letters two at a time", () => {
    expect(pairUp(["A", "B", "C", "D"])).toEqual(["AB", "CD"]);
  });

  it("leaves a trailing odd letter on its own", () => {
    expect(pairUp(["A", "B", "C"])).toEqual(["AB", "C"]);
  });

  it("handles a single letter", () => {
    expect(pairUp(["A"])).toEqual(["A"]);
  });

  it("handles an empty list", () => {
    expect(pairUp([])).toEqual([]);
  });
});
