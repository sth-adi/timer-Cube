import { describe, expect, it } from "vitest";
import { alarmVolume, nextRing, untilLabel, wakeScramble } from "./wake";

describe("Wake Solve", () => {
  it("scrambles without repeating a face or stacking an axis three deep", () => {
    for (let n = 0; n < 50; n++) {
      const s = wakeScramble(14);
      expect(s).toHaveLength(14);
      for (let i = 1; i < s.length; i++) expect(s[i][0]).not.toBe(s[i - 1][0]);
      const axis = (t: string) => "RLUDFB".indexOf(t[0]) >> 1;
      for (let i = 2; i < s.length; i++) expect(axis(s[i]) === axis(s[i - 1]) && axis(s[i]) === axis(s[i - 2])).toBe(false);
    }
  });

  it("rings at the next matching clock time, tomorrow if it's passed", () => {
    const now = new Date(2026, 8, 24, 22, 30);
    expect(nextRing("06:45", now)).toEqual(new Date(2026, 8, 25, 6, 45));
    expect(nextRing("23:00", now)).toEqual(new Date(2026, 8, 24, 23, 0));
    expect(nextRing("22:30", now)).toEqual(new Date(2026, 8, 25, 22, 30));
  });

  it("labels the countdown and ramps the volume", () => {
    expect(untilLabel(7 * 3600e3 + 5 * 60e3)).toBe("7h 05m");
    expect(untilLabel(12 * 60e3 + 30e3)).toBe("12m 30s");
    expect(untilLabel(8200)).toBe("9s");
    expect(alarmVolume(0)).toBeLessThan(0.1);
    expect(alarmVolume(45_000)).toBeCloseTo(0.54, 1);
    expect(alarmVolume(200_000)).toBe(1);
  });
});
