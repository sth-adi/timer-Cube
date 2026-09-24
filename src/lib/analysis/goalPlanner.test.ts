import { describe, expect, it } from "vitest";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { MIN_SOLVES, defaultTargetMs, planGoal, typicalSolveMs } from "./goalPlanner";

/** 40 solves whose phases are each evenly spread between lo and hi (ms). */
function metrics(ranges: [number, number][]): SolveMetrics[] {
  const n = 41;
  return Array.from({ length: n }, (_, i) => ({ phases: ranges.map(([lo, hi]) => lo + ((hi - lo) * i) / (n - 1)) }) as unknown as SolveMetrics);
}

describe("defaultTargetMs", () => {
  it("picks the next whole second below", () => {
    expect(defaultTargetMs(21_400)).toBe(21_000);
    expect(defaultTargetMs(21_000)).toBe(20_000);
  });
});

describe("planGoal", () => {
  // Medians: 3 + 10 + 4 + 3 = 20s. Good days (p25): 2.5 + 8 + 3.5 + 2.75 = 16.75s. Best (p10): 2.2 + 6.8 + 3.2 + 2.6 = 14.8s.
  const m = metrics([
    [2000, 4000],
    [6000, 14000],
    [3000, 5000],
    [2500, 3500],
  ]);

  it("returns null under MIN_SOLVES", () => {
    expect(planGoal(m.slice(0, MIN_SOLVES - 1), 18_000)).toBeNull();
  });

  it("takes the gap from the phase with the most good-day room first", () => {
    const p = planGoal(m, 18_000)!;
    expect(p.currentMs).toBeCloseTo(20_000);
    expect(p.reach).toBe("good-days");
    const f2l = p.phases.find((x) => x.phase === "F2L")!;
    expect(f2l.cutMs).toBeCloseTo(2000); // F2L alone has 2s of good-day room — it covers the whole gap
    expect(p.phases.reduce((s, x) => s + x.cutMs, 0)).toBeCloseTo(2000);
  });

  it("calls a target that needs best days a stretch, and one past them beyond reach", () => {
    expect(planGoal(m, 16_000)!.reach).toBe("best-days");
    const beyond = planGoal(m, 13_000)!;
    expect(beyond.reach).toBe("beyond");
    expect(beyond.shortfallMs).toBeCloseTo(14_800 - 13_000, -1);
  });

  it("says a target you already beat is already reached", () => {
    expect(planGoal(m, 25_000)!.reach).toBe("already");
  });
});

describe("typicalSolveMs", () => {
  it("is the sum of phase medians, and the default target is always below it", () => {
    const m = metrics([
      [2000, 4000],
      [6000, 14000],
      [3000, 5000],
      [2500, 3500],
    ]);
    expect(typicalSolveMs(m)).toBeCloseTo(20_000);
    expect(planGoal(m, defaultTargetMs(typicalSolveMs(m)))!.reach).not.toBe("already");
  });
});
