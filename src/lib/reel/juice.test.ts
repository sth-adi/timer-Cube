import { describe, expect, it } from "vitest";
import { fromReelMs, inspectionPose, introProgress, pulseSince, rampFor, RAMP_SPEED, toReelMs, warpCues } from "./juice";
import type { SoundCue } from "./highlights";

describe("inspection orbit", () => {
  it("starts and ends at rest, and holds still for the last stretch", () => {
    expect(inspectionPose(0)).toEqual({ yaw: 0, pitch: 0 });
    for (const p of [0.82, 0.9, 1]) {
      const { yaw, pitch } = inspectionPose(p);
      expect(Math.abs(yaw)).toBeLessThan(1e-9);
      expect(Math.abs(pitch)).toBeLessThan(1e-9);
    }
  });

  it("actually moves in between, and stays smooth (no frame-to-frame jumps)", () => {
    let maxStep = 0;
    let peak = 0;
    let prev = inspectionPose(0);
    for (let i = 1; i <= 120; i++) {
      const cur = inspectionPose(i / 120);
      maxStep = Math.max(maxStep, Math.abs(cur.yaw - prev.yaw), Math.abs(cur.pitch - prev.pitch));
      peak = Math.max(peak, Math.abs(cur.yaw), Math.abs(cur.pitch));
      prev = cur;
    }
    expect(peak).toBeGreaterThan(20);
    expect(maxStep).toBeLessThan(6);
  });

  it("introProgress runs 0 -> 1 over the intro and stays 1 once the clock is running", () => {
    expect(introProgress(-2400, 2400)).toBe(0);
    expect(introProgress(-1200, 2400)).toBeCloseTo(0.5);
    expect(introProgress(0, 2400)).toBe(1);
    expect(introProgress(5000, 2400)).toBe(1);
    expect(introProgress(-9999, 2400)).toBe(0);
  });
});

const tl = (n: number, totalMs: number) => ({
  moves: Array.from({ length: n }, () => "R"),
  timesMs: Array.from({ length: n }, (_, i) => ((i + 1) * totalMs) / n),
  turnMs: Array.from({ length: n }, () => 100),
  totalMs,
});

describe("finish slow-mo ramp", () => {
  it("slows the last three moves, and skips solves too short to carry one", () => {
    const r = rampFor(tl(20, 10000))!;
    expect(r.speed).toBe(RAMP_SPEED);
    // 20 moves 500ms apart: the 3rd-from-last lands at 9000ms and turns for 100ms.
    expect(r.at).toBe(8900);
    expect(rampFor(tl(6, 10000))).toBeNull();
    expect(rampFor(tl(20, 2500))).toBeNull();
  });

  it("round-trips, is monotonic, and leaves everything before the ramp alone", () => {
    const ramp = { at: 8400, speed: 0.4 };
    expect(toReelMs(ramp, 3000)).toBe(3000);
    expect(toReelMs(ramp, 8400)).toBe(8400);
    expect(toReelMs(ramp, 10000)).toBeCloseTo(8400 + 1600 / 0.4);
    let prev = -Infinity;
    for (let u = -2000; u <= 10000; u += 37) {
      const r = toReelMs(ramp, u);
      expect(r).toBeGreaterThan(prev);
      prev = r;
      expect(fromReelMs(ramp, r, 10000)).toBeCloseTo(u, 6);
    }
  });

  it("runs the end card at real speed after the solve", () => {
    const ramp = { at: 8400, speed: 0.4 };
    const end = toReelMs(ramp, 10000);
    expect(fromReelMs(ramp, end + 500, 10000)).toBeCloseTo(10500);
    expect(fromReelMs(null, 12345, 10000)).toBe(12345);
  });

  it("re-times turn and finish cues with the picture, but not the beat", () => {
    const intro = 2400;
    const ramp = { at: 8400, speed: 0.4 };
    const cues: SoundCue[] = [
      { atMs: 0, kind: "beat" },
      { atMs: intro + 9000, kind: "turn", face: "R" },
      { atMs: intro + 10000, kind: "finish" },
    ];
    const out = warpCues(cues, intro, ramp);
    expect(out[0]).toEqual({ atMs: 0, kind: "beat" });
    expect(out[1].atMs).toBeCloseTo(intro + 8400 + 600 / 0.4);
    expect(out[2].atMs).toBeCloseTo(intro + toReelMs(ramp, 10000));
    expect(warpCues(cues, intro, null)).toEqual(cues);
  });
});

describe("pulseSince", () => {
  it("peaks when the move lands and is gone after the window", () => {
    expect(pulseSince(1000, 1000, 130)).toBe(1);
    expect(pulseSince(1000, 1065, 130)).toBeCloseTo(0.25);
    expect(pulseSince(1000, 1200, 130)).toBe(0);
    expect(pulseSince(undefined, 1000, 130)).toBe(0);
  });
});
