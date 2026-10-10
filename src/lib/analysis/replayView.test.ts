import { describe, expect, it } from "vitest";
import { FIXED_VIEW, minClickGapMs, planTurnSound, turnsPerSecond, viewOrientation } from "./replayView";

describe("viewOrientation", () => {
  it("is the grip itself with no lean or drag", () => {
    expect(viewOrientation(FIXED_VIEW, { yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 })).toBe(FIXED_VIEW);
  });
  it("stays a unit quaternion when leaned and dragged", () => {
    const q = viewOrientation(FIXED_VIEW, { yaw: 5, pitch: -3 }, { yaw: 40, pitch: 90 });
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
  });
});

describe("turn sounds", () => {
  const starts = [0, 250, 500, 750, 1000, 1250];
  it("reads turns per second from the gaps and scales with playback speed", () => {
    expect(turnsPerSecond(starts, 2, 1)).toBeCloseTo(4, 5);
    expect(turnsPerSecond(starts, 2, 2)).toBeCloseTo(8, 5);
    expect(turnsPerSecond(starts, 2, 4)).toBe(12);
  });
  it("thins clicks out at higher speeds", () => {
    expect(minClickGapMs(4)).toBeGreaterThan(minClickGapMs(1) * 2);
    const ends = starts.map((s) => s + 150);
    expect(planTurnSound({ starts, ends, k: 2, speed: 4, sinceLastMs: 60 })).toBeNull();
    expect(planTurnSound({ starts, ends, k: 2, speed: 1, sinceLastMs: 300 })?.durationMs).toBe(150);
  });
});
