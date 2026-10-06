import { describe, expect, it } from "vitest";
import { turnDurationMs } from "./useTurnAnimation";

describe("turnDurationMs", () => {
  it("speeds up as turns pile up, never slower than a calm turn", () => {
    const d = [0, 1, 2, 3, 8].map(turnDurationMs);
    expect(d).toEqual([150, 100, 70, 40, 40]);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
  });
});
