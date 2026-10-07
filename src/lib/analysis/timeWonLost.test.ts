import { describe, expect, it } from "vitest";
import type { PostSolvePhaseRow } from "./postSolveTable";
import type { PostSolveBaseline } from "./postSolveBaseline";
import { timeWonLost } from "./timeWonLost";

const LABELS = ["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"];
const rows = (ms: number[]): PostSolvePhaseRow[] =>
  ms.map((t, i) => ({ label: LABELS[i], group: null, caseName: null, f2lPairIndex: null, startMs: 0, atMs: 0, totalMs: t, recognitionMs: null, executionMs: null }));
const baseline = (ms: number[]): PostSolveBaseline => ({ segments: ms.map((m) => ({ medianMs: m, goodMs: m * 0.9 })), phases: [] });
const USUAL = [2000, 1500, 1500, 1500, 1500, 1800, 1700];

describe("where a solve won and lost time", () => {
  it("names the step that cost the most", () => {
    const r = timeWonLost(rows([2000, 1500, 1500, 2600, 1500, 1800, 1700]), baseline(USUAL), null);
    expect(r.vsUsualTotal).toBe(1100);
    expect(r.headline).toBe("1.10s slower than your usual, F2L 3 cost 1.10s (2.60s vs 1.50s).");
  });

  it("names the step that won the most, and compares against your fastest solve", () => {
    const pb = rows([1500, 1200, 1200, 1200, 1200, 1500, 1400]);
    const r = timeWonLost(rows([1900, 1500, 1500, 1500, 1500, 1100, 1700]), baseline(USUAL), pb);
    expect(r.headline).toBe("0.80s faster than your usual, OLL won 0.70s (1.10s vs 1.80s).");
    expect(r.pbTotalMs).toBe(9200);
    expect(r.steps[5].vsPb).toBe(-400);
  });

  it("says when it evened out, and stays quiet with no history", () => {
    const r = timeWonLost(rows([2000, 1500, 1500, 1900, 1500, 1400, 1700]), baseline(USUAL), null);
    expect(r.headline).toBe("Right on your usual pace, OLL gave back what F2L 3 cost.");
    expect(timeWonLost(rows(USUAL), null, null).headline).toBeNull();
  });
});
