import { describe, expect, it } from "vitest";
import { SETTLE_EPSILON_DEG, SMOOTH_PER_FRAME, changedStickers, quatAngleDeg, rotationVector, smoothingFactor, springAtRest, springStep, stepToward, type SpringPose } from "./smooth";
import type { Quat } from "./orientation";

const IDENTITY_Q: Quat = { x: 0, y: 0, z: 0, w: 1 };
function aboutY(deg: number): Quat {
  const h = (deg * Math.PI) / 360;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

describe("smoothingFactor", () => {
  it("is the per-frame fraction at 60 fps", () => {
    expect(smoothingFactor(1000 / 60)).toBeCloseTo(SMOOTH_PER_FRAME, 6);
  });
  it("is framerate independent: two 60 fps frames equal one 30 fps frame", () => {
    const two = 1 - (1 - smoothingFactor(1000 / 60)) ** 2;
    expect(smoothingFactor(1000 / 30)).toBeCloseTo(two, 6);
  });
  it("closes more of the gap on a longer frame, never more than all of it", () => {
    expect(smoothingFactor(33)).toBeGreaterThan(smoothingFactor(16));
    expect(smoothingFactor(100000)).toBeLessThanOrEqual(1);
  });
  it("does nothing for a zero or negative frame", () => {
    expect(smoothingFactor(0)).toBe(0);
    expect(smoothingFactor(-5)).toBe(0);
    expect(smoothingFactor(Number.NaN)).toBe(0);
  });
});

describe("quatAngleDeg", () => {
  it("measures the shortest rotation, treating q and -q as the same pose", () => {
    expect(quatAngleDeg(IDENTITY_Q, aboutY(90))).toBeCloseTo(90, 5);
    expect(quatAngleDeg(aboutY(90), { x: 0, y: -aboutY(90).y, z: 0, w: -aboutY(90).w })).toBeCloseTo(0, 5);
  });
});

describe("stepToward", () => {
  it("moves part of the way toward the target in one frame", () => {
    const { q, settled } = stepToward(IDENTITY_Q, aboutY(90), 1000 / 60);
    expect(settled).toBe(false);
    expect(quatAngleDeg(q, aboutY(90))).toBeCloseTo(90 * (1 - SMOOTH_PER_FRAME), 3);
  });

  it("converges and then reports settled on exactly the target", () => {
    const target = aboutY(60);
    let cur = IDENTITY_Q;
    let frames = 0;
    for (; frames < 200; frames++) {
      const step = stepToward(cur, target, 1000 / 60);
      cur = step.q;
      if (step.settled) break;
    }
    expect(frames).toBeLessThan(40);
    expect(cur).toBe(target);
  });

  it("skips (settles at once) when the change is negligible", () => {
    const target = aboutY(SETTLE_EPSILON_DEG / 2);
    const step = stepToward(IDENTITY_Q, target, 1000 / 60);
    expect(step.settled).toBe(true);
    expect(step.q).toBe(target);
  });

  it("takes the short way round across the quaternion double cover", () => {
    const near = aboutY(170);
    const target = aboutY(-170);
    const { q } = stepToward(near, target, 1000 / 60);
    expect(quatAngleDeg(q, target)).toBeLessThan(quatAngleDeg(near, target));
    expect(quatAngleDeg(near, target)).toBeCloseTo(20, 4);
  });

  it("keeps the result a unit quaternion", () => {
    const { q } = stepToward(IDENTITY_Q, aboutY(120), 20);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 9);
  });
});

describe("changedStickers", () => {
  const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

  it("returns nothing with no previous state or a mismatched one", () => {
    expect(changedStickers(null, solved)).toEqual([]);
    expect(changedStickers("UUU", solved)).toEqual([]);
  });

  it("returns nothing when nothing changed", () => {
    expect(changedStickers(solved, solved)).toEqual([]);
  });

  it("lists exactly the stickers that changed colour", () => {
    const next = solved.slice(0, 9) + "FRRRRRRRR" + solved.slice(18);
    expect(changedStickers(solved, next)).toEqual([9]);
  });

  it("treats a wholesale change as a re-sync, not a turn", () => {
    const scrambled = "RRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBBUUUUUUUUU";
    expect(changedStickers(solved, scrambled)).toEqual([]);
  });
});


const aroundY = (deg: number): Quat => ({ x: 0, y: Math.sin((deg * Math.PI) / 360), z: 0, w: Math.cos((deg * Math.PI) / 360) });
const REST: SpringPose = { q: aroundY(0), w: [0, 0, 0] };
const angleTo = (a: Quat, b: Quat) => {
  const v = rotationVector(a, b);
  return (Math.hypot(v[0], v[1], v[2]) * 180) / Math.PI;
};

describe("springStep", () => {
  it("glides to the target and then reports rest exactly on it", () => {
    let pose: SpringPose & { settled?: boolean } = REST;
    const target = aroundY(80);
    for (let i = 0; i < 120 && !pose.settled; i++) pose = springStep(pose, target, 1000 / 60);
    expect(pose.settled).toBe(true);
    expect(pose.q).toEqual(target);
  });

  it("never overshoots (critically damped)", () => {
    let pose: SpringPose = REST;
    const target = aroundY(90);
    let last = angleTo(pose.q, target);
    for (let i = 0; i < 90; i++) {
      pose = springStep(pose, target, 1000 / 60);
      const now = angleTo(pose.q, target);
      expect(now).toBeLessThanOrEqual(last + 1e-6);
      last = now;
    }
  });

  it("keeps moving between samples: a velocity carries on after the target stops changing", () => {
    // Chase a target that steps every 50 ms (a 20 Hz sensor), at 60 fps.
    let pose: SpringPose = REST;
    const speeds: number[] = [];
    let target = aroundY(0);
    for (let frame = 0; frame < 60; frame++) {
      if (frame % 3 === 0) target = aroundY((frame / 3) * 6);
      pose = springStep(pose, target, 1000 / 60);
      speeds.push((Math.hypot(...pose.w) * 180) / Math.PI);
    }
    // After warm-up the pose never stalls and its speed changes gradually frame to frame.
    for (let i = 12; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThan(40);
      expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(60);
    }
  });

  it("takes the short way round for an equivalent (negated) target", () => {
    const target = aroundY(40);
    const negated: Quat = { x: -target.x, y: -target.y, z: -target.z, w: -target.w };
    const a = springStep(REST, target, 16);
    const b = springStep(REST, negated, 16);
    expect(angleTo(a.q, b.q)).toBeLessThan(1e-6);
  });

  it("is close to frame-rate independent", () => {
    const target = aroundY(70);
    const run = (fps: number) => {
      let pose: SpringPose = REST;
      for (let i = 0; i < Math.round(fps * 0.2); i++) pose = springStep(pose, target, 1000 / fps);
      return pose.q;
    };
    expect(angleTo(run(30), run(144))).toBeLessThan(2);
  });

  it("reports rest only when both close and slow", () => {
    expect(springAtRest(REST, aroundY(0))).toBe(true);
    expect(springAtRest(REST, aroundY(10))).toBe(false);
    expect(springAtRest({ q: aroundY(0), w: [0, 3, 0] }, aroundY(0))).toBe(false);
  });
});
