import { describe, expect, it } from "vitest";
import { absorbTargetChange, criticallyDampedStep, SPRING_REST, smoothedValue, type SpringState } from "./smoothing";

/** Runs the ease for `totalMs` in frames of `frameMs`, returns the final state. */
function run(start: SpringState, totalMs: number, frameMs: number, omega?: number): SpringState {
  let s = start;
  for (let t = 0; t < totalMs - 1e-9; t += frameMs) s = criticallyDampedStep(s, frameMs, omega);
  return s;
}

describe("criticallyDampedStep", () => {
  it("leaves a settled spring alone", () => {
    expect(criticallyDampedStep(SPRING_REST, 16)).toBe(SPRING_REST);
  });

  it("closes the gap smoothly and lands exactly at rest", () => {
    let s: SpringState = { e: -50, v: 0 };
    let prev = Math.abs(s.e);
    for (let i = 0; i < 200 && s !== SPRING_REST; i++) {
      s = criticallyDampedStep(s, 1000 / 60);
      expect(Math.abs(s.e)).toBeLessThanOrEqual(prev + 1e-9);
      prev = Math.abs(s.e);
    }
    expect(s).toBe(SPRING_REST);
  });

  it("never overshoots when it starts from rest", () => {
    let s: SpringState = { e: 30, v: 0 };
    for (let i = 0; i < 120; i++) {
      s = criticallyDampedStep(s, 1000 / 60);
      expect(s.e).toBeGreaterThanOrEqual(0);
    }
  });

  it("follows the same path at any frame rate", () => {
    const start: SpringState = { e: -40, v: 0 };
    const at30 = run(start, 400, 1000 / 30);
    const at60 = run(start, 400, 1000 / 60);
    const at120 = run(start, 400, 1000 / 120);
    expect(at30.e).toBeCloseTo(at60.e, 6);
    expect(at120.e).toBeCloseTo(at60.e, 6);
  });

  it("is exact for the analytic solution (e0 = 1, v0 = 0 at t = 1/omega gives 2/e)", () => {
    const s = criticallyDampedStep({ e: 1, v: 0 }, 1000 / 10, 10, 100);
    // Scale is large here only to keep the rest check from snapping the value to 0.
    expect(s.e).toBeCloseTo(2 / Math.E, 9);
  });

  it("treats a stalled frame as a bounded one", () => {
    const s = criticallyDampedStep({ e: 10, v: 0 }, 60_000);
    expect(Number.isFinite(s.e)).toBe(true);
    expect(Math.abs(s.e)).toBeLessThan(10);
  });

  it("ignores a non-positive or garbage dt", () => {
    expect(criticallyDampedStep({ e: 5, v: 0 }, 0)).toEqual({ e: 5, v: 0 });
    expect(criticallyDampedStep({ e: 5, v: 0 }, -20)).toEqual({ e: 5, v: 0 });
    expect(criticallyDampedStep({ e: 5, v: 0 }, Number.NaN)).toEqual({ e: 5, v: 0 });
  });
});

describe("absorbTargetChange", () => {
  it("follows ordinary growth exactly (no gap opens)", () => {
    expect(absorbTargetChange(SPRING_REST, 10, 10.6, 2)).toBe(SPRING_REST);
  });

  it("turns a jump into a gap that keeps the drawn value where it was", () => {
    const next = absorbTargetChange(SPRING_REST, 10, 40, 2);
    expect(smoothedValue(40, next)).toBe(10);
  });

  it("keeps an in-flight ease continuous when a second jump lands", () => {
    const mid: SpringState = { e: -5, v: 3 };
    const drawnBefore = smoothedValue(20, mid);
    const next = absorbTargetChange(mid, 20, 50, 2);
    expect(smoothedValue(50, next)).toBe(drawnBefore);
    expect(next.v).toBe(3);
  });

  it("eases every change when jumpAbove is 0", () => {
    const next = absorbTargetChange(SPRING_REST, 1, 1.01, 0);
    expect(next.e).toBeCloseTo(-0.01, 12);
  });

  it("ignores identical and non-finite targets", () => {
    expect(absorbTargetChange(SPRING_REST, 5, 5, 0)).toBe(SPRING_REST);
    expect(absorbTargetChange(SPRING_REST, 5, Number.NaN, 0)).toBe(SPRING_REST);
  });
});

describe("smoothedValue", () => {
  it("clamps to the range the indicator can show", () => {
    expect(smoothedValue(0.95, { e: 0.3, v: 0 }, 0, 1)).toBe(1);
    expect(smoothedValue(0.05, { e: -0.3, v: 0 }, 0, 1)).toBe(0);
  });
});
