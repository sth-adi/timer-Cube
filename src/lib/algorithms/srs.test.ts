import { describe, expect, it } from "vitest";
import { applyRecallTime, applyReview, deriveStatus, initialProgress, isDue } from "./srs";

describe("srs", () => {
  it("a new case has no progress and is always due", () => {
    expect(deriveStatus(undefined)).toBe("new");
    expect(isDue(undefined)).toBe(true);
  });

  it("first 'good' review schedules a 1-day interval and moves to learning", () => {
    const now = Date.now();
    const p = initialProgress("x", now);
    const after = applyReview(p, "good", now);
    expect(after.intervalDays).toBe(1);
    expect(after.dueAt).toBeGreaterThan(now);
    expect(deriveStatus(after)).toBe("learning");
    expect(isDue(after, now)).toBe(false);
  });

  it("'again' resets the interval and schedules a short same-session delay", () => {
    const now = Date.now();
    let p = initialProgress("x", now);
    p = applyReview(p, "good", now);
    p = applyReview(p, "good", now);
    expect(p.intervalDays).toBeGreaterThan(0);
    const afterLapse = applyReview(p, "again", now);
    expect(afterLapse.intervalDays).toBe(0);
    expect(afterLapse.lapses).toBe(1);
    expect(afterLapse.dueAt - now).toBeLessThan(60 * 60 * 1000);
  });

  it("repeated 'easy' reviews grow the interval past the known threshold", () => {
    const now = Date.now();
    let p = initialProgress("x", now);
    for (let i = 0; i < 6; i++) p = applyReview(p, "easy", now);
    expect(p.intervalDays).toBeGreaterThanOrEqual(21);
    expect(deriveStatus(p)).toBe("known");
  });

  it("'hard' grows the interval more slowly than 'good'", () => {
    const now = Date.now();
    const base = { ...initialProgress("x", now), intervalDays: 10, reps: 3 };
    const hard = applyReview(base, "hard", now);
    const good = applyReview(base, "good", now);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
  });
});

describe("applyRecallTime", () => {
  it("records the first sample as the best", () => {
    const p = initialProgress("x");
    const { progress, isPB } = applyRecallTime(p, 2000);
    expect(isPB).toBe(true);
    expect(progress.bestRecallMs).toBe(2000);
  });

  it("updates the best only when actually beaten", () => {
    const p = initialProgress("x");
    const { progress: afterFirst } = applyRecallTime(p, 2000);

    const slower = applyRecallTime(afterFirst, 3000);
    expect(slower.isPB).toBe(false);
    expect(slower.progress.bestRecallMs).toBe(2000);

    const faster = applyRecallTime(afterFirst, 1200);
    expect(faster.isPB).toBe(true);
    expect(faster.progress.bestRecallMs).toBe(1200);
  });

  it("leaves the rest of the progress untouched", () => {
    const p = { ...initialProgress("x"), reps: 4, ease: 2.7 };
    const { progress } = applyRecallTime(p, 1500);
    expect(progress.reps).toBe(4);
    expect(progress.ease).toBe(2.7);
  });
});
