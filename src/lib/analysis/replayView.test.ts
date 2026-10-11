import { describe, expect, it } from "vitest";
import { applyMove } from "@/lib/cube-engine/stickerTurns";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { buildTimeline } from "./replayTiming";
import { FIXED_VIEW, minClickGapMs, planTurnSound, stageStateAt, turnsPerSecond, viewOrientation } from "./replayView";

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

describe("stageStateAt with a split double", () => {
  const before = scrambleToFacelets("R F");
  const afterDouble = applyMove(applyMove(before, "U"), "U");
  const half = applyMove(before, "U");
  // Move 0 is "U2" in two quarters (the first made at 300ms, the second at 420ms); move 1 is "R" at 1000ms.
  const tokens = ["U2", "R"];
  const timeline = buildTimeline([420, 580], { fluid: true, realPauses: true, halves: [300, null] });
  const faceletsAfter = [before, afterDouble, applyMove(afterDouble, "R")];
  const at = (pos: number) => stageStateAt({ tokens, starts: timeline.starts, ends: timeline.ends, halves: timeline.halves, faceletsAfter, pos });
  const h = timeline.halves![0]!;

  it("shows the first quarter turning, then the half-way cube, then the second quarter", () => {
    const early = at((h.firstStart + h.firstEnd) / 2);
    expect(early.facelets).toBe(before);
    expect(early.turning?.progress).toBeCloseTo(0.5, 5);
    expect(early.k).toBe(0);
    const mid = at((h.firstEnd + h.secondStart) / 2 + 0.01);
    if (h.secondStart > h.firstEnd) {
      expect(mid.facelets).toBe(half);
      expect(mid.turning).toBeNull();
    }
    const late = at((h.secondStart + h.secondEnd) / 2);
    expect(late.facelets).toBe(half);
    expect(late.turning?.progress).toBeCloseTo(0.5, 5);
  });
  it("is exactly the cube after the double at its end", () => {
    expect(at(h.secondEnd).facelets).toBe(afterDouble);
    expect(at(h.secondEnd).turning).toBeNull();
    expect(at(h.secondEnd + 1).facelets).toBe(afterDouble);
    expect(half).not.toBe(afterDouble);
  });
  it("turns an ordinary move as before", () => {
    const s = at((timeline.starts[1] + timeline.ends[1]) / 2);
    expect(s.facelets).toBe(afterDouble);
    expect(s.turning?.progress).toBeCloseTo(0.5, 5);
    expect(at(timeline.durationMs).facelets).toBe(faceletsAfter[2]);
  });
  it("clicks once per quarter", () => {
    const p = planTurnSound({ starts: timeline.starts, ends: timeline.ends, k: 0, speed: 1, sinceLastMs: 1000, halves: timeline.halves, part: 1 });
    expect(p?.durationMs).toBeCloseTo(Math.min(160, Math.max(40, h.secondEnd - h.secondStart)), 5);
  });
});
