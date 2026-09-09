import { describe, expect, it } from "vitest";
import { buildSpeechQueue } from "./bldSpeech";
import type { BldMemo } from "./bldMemo";

function memo(cornerWords: string[][], edgeWords: string[][]): BldMemo {
  return { cornerWords, edgeWords, cornersSolved: cornerWords.length === 0, edgesSolved: edgeWords.length === 0 };
}

describe("buildSpeechQueue", () => {
  it("is empty for a fully solved memo", () => {
    expect(buildSpeechQueue(memo([], []))).toEqual([]);
  });

  it("pairs up letters within each word, corners before edges", () => {
    const q = buildSpeechQueue(memo([["B", "C"]], [["D", "E", "F"]]));
    expect(q).toEqual([
      { section: "corner", display: "BC", text: "B, C" },
      { section: "edge", display: "DE", text: "D, E" },
      { section: "edge", display: "F", text: "F" },
    ]);
  });

  it("keeps every word within a section, and every section, in order", () => {
    const q = buildSpeechQueue(memo([["A", "B"], ["C", "D", "E"]], []));
    expect(q.map((i) => i.display)).toEqual(["AB", "CD", "E"]);
    expect(q.every((i) => i.section === "corner")).toBe(true);
  });
});
