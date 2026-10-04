import { describe, expect, it } from "vitest";
import { buildDailyPlan, type DailyPlanInput } from "./dailyPlan";
import { dateKeyFor, yesterdayDateKey } from "./dailyChallenge";

const base: DailyPlanInput = {
  dueAlgCount: 0,
  phases: null,
  phaseSampleSize: 0,
  trainerTimes: { f2l: [], oll: [], pll: [], zbll: [] },
  solvesToday: 0,
  dailyGoal: 0,
  eventsPracticed: [],
  dailyChallengeStreak: 7,
  dailyChallengeDoneToday: false,
};

describe("buildDailyPlan streak", () => {
  it("shows a live streak (last completed yesterday)", () => {
    const plan = buildDailyPlan({ ...base, dailyChallengeLastCompletedDateKey: yesterdayDateKey() });
    expect(plan[0].title).toContain("7-day streak");
  });

  it("does not present a broken streak as live", () => {
    const plan = buildDailyPlan({ ...base, dailyChallengeLastCompletedDateKey: dateKeyFor(new Date(2020, 0, 1)) });
    expect(plan[0].title).not.toContain("streak alive");
  });

  it("trusts the stored streak when no completion date is given", () => {
    expect(buildDailyPlan(base)[0].title).toContain("7-day streak");
  });
});
