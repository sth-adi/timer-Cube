import { describe, expect, it } from "vitest";
import { HOME_ORIENTATION, axisRotation, matToQuat, mul, sequenceMatrix } from "@/lib/gyro/orientation";
import {
  GYRO_FOLLOW,
  LEAN_FALL_MS,
  LEAN_HOLD_MS,
  MAX_LEAN_DEG,
  REST_SPRING,
  buildLeanTurns,
  faceOfToken,
  gyroLean,
  leanAt,
  stepLean,
} from "./replayCamera";

const turn = (token: string, start: number, end = start + 150) => buildLeanTurns([token], [start], [end]);

describe("faceOfToken", () => {
  it("reads face and wide turns, ignores slices and rotations", () => {
    expect(faceOfToken("R'")).toBe("R");
    expect(faceOfToken("U2")).toBe("U");
    expect(faceOfToken("r")).toBe("R");
    expect(faceOfToken("Fw")).toBe("F");
    for (const t of ["M", "E'", "S2", "x", "y'", "z2", ""]) expect(faceOfToken(t)).toBeNull();
  });
});

describe("leanAt", () => {
  it("is at rest before any turn and long after the last one", () => {
    const turns = turn("R", 1000);
    expect(leanAt(turns, 0)).toEqual({ yaw: 0, pitch: 0 });
    const late = leanAt(turns, 1150 + LEAN_HOLD_MS + LEAN_FALL_MS + 1);
    expect(late).toEqual({ yaw: 0, pitch: 0 });
  });

  it("swings toward the turned face", () => {
    const at = (t: string) => leanAt(turn(t, 0, 150), 200);
    expect(at("R").yaw).toBeGreaterThan(1);
    expect(at("L").yaw).toBeLessThan(-1);
    expect(at("F").yaw).toBeLessThan(-1);
    expect(at("B").yaw).toBeGreaterThan(1);
    expect(at("U").pitch).toBeGreaterThan(1);
    expect(at("D").pitch).toBeLessThan(-1);
    expect(at("U").yaw).toBe(0);
  });

  it("follows where the face really is on screen when the cube is held another way", () => {
    // Held yellow-top (z2), the cube's R face is on the viewer's left.
    expect(leanAt(turn("R", 0), 200, HOME_ORIENTATION).yaw).toBeLessThan(-1);
    expect(leanAt(turn("U", 0), 200, HOME_ORIENTATION).pitch).toBeLessThan(-1);
  });

  it("eases in and out without jumping", () => {
    const turns = turn("R", 1000, 1150);
    let prev = leanAt(turns, 900).yaw;
    let peak = 0;
    for (let t = 901; t < 2200; t++) {
      const y = leanAt(turns, t).yaw;
      expect(Math.abs(y - prev)).toBeLessThan(0.1);
      peak = Math.max(peak, y);
      prev = y;
    }
    expect(peak).toBeGreaterThan(3);
    expect(peak).toBeLessThanOrEqual(MAX_LEAN_DEG);
  });

  it("never exceeds the limit however fast the turning", () => {
    const tokens = Array.from({ length: 40 }, () => "R");
    const starts = tokens.map((_, i) => i * 100);
    const turns = buildLeanTurns(tokens, starts, starts.map((s) => s + 90));
    for (let t = 0; t < 4200; t += 37) {
      const l = leanAt(turns, t);
      expect(Math.abs(l.yaw)).toBeLessThanOrEqual(MAX_LEAN_DEG);
      expect(Math.abs(l.pitch)).toBeLessThanOrEqual(MAX_LEAN_DEG);
    }
  });

  it("is a function of the position alone", () => {
    const turns = buildLeanTurns(["R", "U", "R'", "U'"], [0, 200, 400, 600], [150, 350, 550, 750]);
    const a = leanAt(turns, 500);
    leanAt(turns, 2000);
    leanAt(turns, 10);
    expect(leanAt(turns, 500)).toEqual(a);
  });
});

describe("gyroLean", () => {
  const q = (m: ReturnType<typeof axisRotation>) => matToQuat(m);

  it("is zero in the home grip", () => {
    const l = gyroLean(q(HOME_ORIENTATION));
    expect(Math.abs(l.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(l.pitch)).toBeLessThan(1e-6);
  });

  it("copies a share of a small tilt, with the camera's sign", () => {
    const yawed = gyroLean(q(mul(axisRotation("y", 10), HOME_ORIENTATION)));
    expect(yawed.yaw).toBeCloseTo(10 * GYRO_FOLLOW, 3);
    const pitched = gyroLean(q(mul(axisRotation("x", 10), HOME_ORIENTATION)));
    expect(pitched.pitch).toBeCloseTo(-10 * GYRO_FOLLOW, 3);
  });

  it("ignores a regrip and only follows the tilt around it", () => {
    const regripped = mul(sequenceMatrix("y"), HOME_ORIENTATION);
    expect(Math.abs(gyroLean(q(regripped)).yaw)).toBeLessThan(1e-6);
    const regrippedAndTilted = mul(axisRotation("y", 8), regripped);
    expect(gyroLean(q(regrippedAndTilted)).yaw).toBeCloseTo(8 * GYRO_FOLLOW, 3);
  });
});

describe("stepLean", () => {
  it("settles on the target without overshooting", () => {
    let s = REST_SPRING;
    let settled = false;
    let max = 0;
    for (let i = 0; i < 300 && !settled; i++) {
      const r = stepLean(s, { yaw: 6, pitch: -3 }, 16);
      s = r.spring;
      settled = r.settled;
      max = Math.max(max, s.yaw);
    }
    expect(settled).toBe(true);
    expect(max).toBeLessThanOrEqual(6 + 1e-9);
    expect(s.yaw).toBe(6);
    expect(s.pitch).toBe(-3);
  });

  it("covers the same ground whatever the frame rate", () => {
    const run = (dt: number) => {
      let s = REST_SPRING;
      for (let t = 0; t < 400; t += dt) s = stepLean(s, { yaw: 6, pitch: 0 }, dt).spring;
      return s.yaw;
    };
    expect(run(8)).toBeCloseTo(run(40), 1);
  });
});
