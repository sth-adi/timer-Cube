import { describe, expect, it } from "vitest";
import { buildProjectionModel, projectAtTime, projectLive } from "./liveProjection";

/** A solve whose milestones are fixed shares of `total`, with cross at `crossShare`. */
const solve = (total: number, crossShare = 0.13) => [crossShare * total, 0.26 * total, 0.38 * total, 0.5 * total, 0.62 * total, 0.8 * total, total];

describe("live projection", () => {
  it("stays silent without enough history or before the first milestone", () => {
    const model = buildProjectionModel([solve(12000), solve(13000)], null);
    expect(projectLive(model, [1500, null, null, null, null, null, null])).toBeNull();
    const full = buildProjectionModel(Array.from({ length: 8 }, (_, i) => solve(12000 + i * 100)), null);
    expect(projectLive(full, [null, null, null, null, null, null, null])).toBeNull();
  });

  it("with a few solves, projects your median remaining time", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), null);
    const p = projectLive(model, [1000, null, null, null, null, null, null])!;
    // Median remaining after cross is 8700.
    expect(p.projectedMs).toBeCloseTo(9700);
    expect(p.milestone).toBe("Cross");
    expect(p.detail).toMatch(/0\.30s earlier than usual/);
  });

  it("with many solves, fits how finishing time scales with each milestone", () => {
    // Totals 10–15.5s, perfectly proportional: the fit recovers total = m / share.
    const history = Array.from({ length: 12 }, (_, i) => solve(10000 + i * 500));
    const model = buildProjectionModel(history, 11000);
    const p = projectLive(model, [2600, 5200, null, null, null, null, null])!;
    expect(p.milestone).toBe("Pair 1");
    expect(p.projectedMs).toBeCloseTo(20000, -2);
    expect(p.errMs).toBeLessThan(50);
    const fast = projectLive(model, [1200, 2400, null, null, null, null, null])!;
    expect(fast.projectedMs).toBeLessThan(11000);
    expect(fast.pbPace).toBe(true);
    expect(fast.headline).toBe("PB pace");
  });

  it("uses the latest milestone reached", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), null);
    const p = projectLive(model, [1300, 2600, 3800, 5000, 6200, 8000, null])!;
    expect(p.milestone).toBe("OLL");
    expect(p.projectedMs).toBeCloseTo(10000);
  });
});

describe("projection between milestones", () => {
  it("pushes the finish out once you're overdue for the next milestone", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), 9000);
    const p = projectLive(model, [1300, null, null, null, null, null, null])!;
    // Usual gap cross → pair 1 is 1300ms; at 2000 you're not overdue yet.
    expect(projectAtTime(model, p, 2000).projectedMs).toBeCloseTo(p.projectedMs);
    const late = projectAtTime(model, p, 4600);
    expect(late.projectedMs).toBeCloseTo(p.projectedMs + 2000);
    expect(late.detail).toMatch(/2\.00s longer than usual since Cross/);
    expect(late.pbPace).toBe(false);
    // Still the whole rest of the solve to go, however long you've stalled.
    expect(projectAtTime(model, p, 50000).projectedMs).toBe(57400);
  });
});
