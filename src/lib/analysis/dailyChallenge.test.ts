import { describe, expect, it } from "vitest";
import { activeStreak, dateKeyFor, nextStreak } from "./dailyChallenge";

describe("dailyChallenge", () => {
  describe("nextStreak", () => {
    const today = "2024-5-10";
    const yesterday = "2024-5-9";

    it("starts a streak at 1 on the first-ever completion", () => {
      expect(nextStreak(null, 0, today, yesterday)).toBe(1);
    });

    it("continues an unbroken streak from yesterday", () => {
      expect(nextStreak(yesterday, 4, today, yesterday)).toBe(5);
    });

    it("resets after a gap of more than one day", () => {
      expect(nextStreak("2024-5-1", 10, today, yesterday)).toBe(1);
    });

    it("is a no-op if today was already completed (idempotent)", () => {
      expect(nextStreak(today, 5, today, yesterday)).toBe(5);
    });
  });

  describe("activeStreak", () => {
    const today = "2024-5-10";
    const yesterday = "2024-5-9";

    it("keeps the streak when completed today or yesterday", () => {
      expect(activeStreak(today, 5, today, yesterday)).toBe(5);
      expect(activeStreak(yesterday, 5, today, yesterday)).toBe(5);
    });

    it("is 0 once a day has been missed, or when never completed", () => {
      expect(activeStreak("2024-5-1", 5, today, yesterday)).toBe(0);
      expect(activeStreak(null, 0, today, yesterday)).toBe(0);
    });
  });

  it("dateKeyFor produces a stable key for a given calendar day", () => {
    const a = dateKeyFor(new Date(2024, 4, 10, 1, 0, 0));
    const b = dateKeyFor(new Date(2024, 4, 10, 23, 59, 0));
    expect(a).toBe(b);
    expect(dateKeyFor(new Date(2024, 4, 11, 1, 0, 0))).not.toBe(a);
  });
});
