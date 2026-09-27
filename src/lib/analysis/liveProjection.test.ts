import { describe, expect, it } from "vitest";
import type { SolvePrediction } from "./prediction";
import { buildProjectionModel, projectAtTime, projectLive, projectPreSolve } from "./liveProjection";

const prediction = (predictedMs: number, modelMaeMs = 500, useful = true): SolvePrediction =>
  ({ predictedMs, pbProbability: null, skill: { testSize: 20, modelMaeMs, baselineMaeMs: modelMaeMs * 1.2, useful } }) as unknown as SolvePrediction;

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

describe("pre-solve projection (from the scramble alone)", () => {
  it("hands the scramble's own difficulty estimate the same Projection shape, k=-1", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), 9500);
    const p = projectPreSolve(model, prediction(11000, 400))!;
    expect(p.k).toBe(-1);
    expect(p.milestone).toBe("scramble");
    expect(p.projectedMs).toBe(11000);
    expect(p.errMs).toBe(400);
    expect(p.pbPace).toBe(false); // 11000 isn't below the 9500 PB
  });

  it("stays silent until the model has actually proven itself useful", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), null);
    expect(projectPreSolve(model, prediction(11000, 400, false))).toBeNull();
    expect(projectPreSolve(model, null)).toBeNull();
  });

  it("inflates the pre-solve call the longer the cross itself is overdue", () => {
    const model = buildProjectionModel(Array.from({ length: 6 }, () => solve(10000)), null);
    const p = projectPreSolve(model, prediction(10000, 400))!;
    // Usual time to reach Cross is 1300ms; at 800ms elapsed, nothing's overdue yet.
    expect(projectAtTime(model, p, 800).projectedMs).toBe(10000);
    // At 3000ms with no cross yet, 1700ms overdue on top of the call.
    const late = projectAtTime(model, p, 3000);
    expect(late.projectedMs).toBeCloseTo(11700);
    expect(late.detail).toMatch(/1\.70s longer than usual since scramble/);
  });
});
