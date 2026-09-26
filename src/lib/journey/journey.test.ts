import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { DAY, WEEK, assignFocus, checkpointAt, currentLevelMs, reviewJourney, trimmedMean, weekPlans, type Journey } from "./journey";

const T0 = Date.UTC(2026, 0, 5);
let n = 0;
const solve = (date: number, timeMs: number): Solve => ({ id: `s${n++}`, sessionId: "x", timeMs, penalty: "none", scramble: "", date });
/** `count` solves spread through week `w`, all around `ms`. */
const week = (w: number, ms: number, count = 20) => Array.from({ length: count }, (_, i) => solve(T0 + w * WEEK + (i + 1) * (6 * DAY) / (count + 1), ms + ((i % 5) - 2) * 100));

const journey: Journey = { createdAt: T0, baselineMs: 20000, targetMs: 17000, weeks: 6, solvesPerWeek: 100, focus: ["F2L", "F2L", "Cross", "OLL", "PLL", "Consolidate"] };

describe("Training Journey", () => {
  it("front-loads the checkpoints and lands on the target", () => {
    const plans = weekPlans(journey);
    expect(plans).toHaveLength(6);
    expect(plans[5].checkpointMs).toBeCloseTo(17000);
    const drops = plans.map((p, i) => (i ? plans[i - 1].checkpointMs : 20000) - p.checkpointMs);
    expect(drops[0]).toBeGreaterThan(drops[5]);
    expect(checkpointAt(20000, 17000, 0)).toBe(20000);
  });

  it("gives weeks to phases by how much they're asked to cut, ending on consolidation", () => {
    const f = assignFocus(6, [
      { phase: "Cross", cutMs: 200 },
      { phase: "F2L", cutMs: 1500 },
      { phase: "OLL", cutMs: 500 },
      { phase: "PLL", cutMs: 0 },
    ]);
    expect(f).toHaveLength(6);
    expect(f[5]).toBe("Consolidate");
    expect(f.filter((x) => x === "F2L").length).toBeGreaterThanOrEqual(3);
    expect(f[0]).toBe("F2L");
    expect(f).toContain("OLL");
    expect(assignFocus(2, [])).toEqual(["Consistency", "Consistency"]);
  });

  it("drops the extremes for a robust average", () => {
    expect(trimmedMean([10, 10, 10, 10, 10, 10, 10, 10, 10, 1000])).toBe(10);
    expect(currentLevelMs([solve(0, 1)])).toBeNull();
  });

  it("marks weeks against their checkpoints and projects the trend", () => {
    const plans = weekPlans(journey);
    const solves = [...week(0, plans[0].checkpointMs - 400), ...week(1, plans[1].checkpointMs + 50), ...week(2, plans[2].checkpointMs + 1500)];
    const r = reviewJourney(journey, solves, T0 + 3 * WEEK + DAY);
    expect(r.current).toBe(3);
    expect(r.weeks.map((w) => w.status)).toEqual(["ahead", "on-track", "behind", "current", "upcoming", "upcoming"]);
    expect(r.projectedMs).not.toBeNull();
    expect(r.headline).toMatch(/^Week 4 of 6/);
  });

  it("says how far to move the plan after two weeks behind", () => {
    const solves = [...week(0, 19800), ...week(1, 19600)];
    const r = reviewJourney(journey, solves, T0 + 2 * WEEK + DAY);
    expect(r.weeks[0].status).toBe("behind");
    expect(r.weeks[1].status).toBe("behind");
    expect(r.onPace).toBe(false);
    expect(r.advice[0]).toMatch(/Two weeks behind/);
    expect(r.advice.join(" ")).toMatch(/20 of 100 planned solves/);
  });

  it("calls a quiet week missed, and a reached target reached", () => {
    const r = reviewJourney(journey, [...week(0, 16500, 3)], T0 + WEEK + DAY);
    expect(r.weeks[0].status).toBe("missed");
    // A handful of fast solves early in the week isn't arriving yet.
    expect(reviewJourney(journey, week(0, 16500, 8), T0 + 6 * DAY + 20 * 3600e3).reached).toBe(false);
    const done = reviewJourney(journey, week(0, 16500), T0 + WEEK + DAY);
    expect(done.reached).toBe(true);
    expect(done.headline).toMatch(/You're there/);
  });
});
