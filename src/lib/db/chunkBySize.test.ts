import { describe, expect, it } from "vitest";
import { chunkBySize } from "./cloudSync";

describe("chunkBySize", () => {
  it("keeps every row, in order", () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ i }));
    expect(chunkBySize(rows).flat()).toEqual(rows);
  });

  it("splits large rows so no request carries more than ~400KB", () => {
    const big = "x".repeat(150_000);
    const rows = Array.from({ length: 7 }, (_, i) => ({ i, big }));
    const chunks = chunkBySize(rows);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(JSON.stringify(c).length).toBeLessThan(500_000);
  });

  it("sends one oversized row on its own rather than dropping it", () => {
    const chunks = chunkBySize([{ big: "y".repeat(900_000) }, { small: 1 }]);
    expect(chunks.map((c) => c.length)).toEqual([1, 1]);
  });

  it("returns nothing for nothing", () => {
    expect(chunkBySize([])).toEqual([]);
  });
});
