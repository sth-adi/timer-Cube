import { describe, expect, it } from "vitest";
import type { GyroSample } from "./orientation";
import { appendGyroSample } from "./gyroLog";

const sample = (atMs: number): GyroSample => ({ atMs, q: { x: 0, y: 0, z: 0, w: 1 } });

function fill(n: number, cap: number, protectFromMs: number | null = null): GyroSample[] {
  const log: GyroSample[] = [];
  for (let i = 0; i < n; i++) appendGyroSample(log, sample(i * 20), protectFromMs, cap);
  return log;
}

describe("appendGyroSample", () => {
  it("keeps everything below the cap", () => {
    expect(fill(100, 100)).toHaveLength(100);
  });

  it("stays bounded, keeps the newest sample and the first one, and stays in order", () => {
    const log = fill(5000, 100);
    expect(log.length).toBeLessThanOrEqual(100);
    expect(log[0].atMs).toBe(0);
    expect(log[log.length - 1].atMs).toBe(4999 * 20);
    for (let i = 1; i < log.length; i++) expect(log[i].atMs).toBeGreaterThan(log[i - 1].atMs);
  });

  it("keeps the most recent samples at full rate while the old wait thins out", () => {
    const log = fill(5000, 100);
    const recent = log.slice(-25);
    expect(recent.every((s, i) => i === 0 || s.atMs - recent[i - 1].atMs === 20)).toBe(true);
    expect(log[1].atMs - log[0].atMs).toBeGreaterThan(20);
  });

  it("never loses the solve to a long armed wait", () => {
    // 4000 samples of waiting, then a 500-sample solve starting at t = 80000.
    const log: GyroSample[] = [];
    for (let i = 0; i < 4500; i++) appendGyroSample(log, sample(i * 20), i >= 4000 ? 80000 : null, 1000);
    const solve = log.filter((s) => s.atMs >= 80000);
    expect(solve).toHaveLength(500);
    expect(log.length).toBeLessThanOrEqual(1000);
  });

  it("falls back to thinning the older half when nearly everything is solve", () => {
    const log = fill(5000, 100, 0);
    expect(log.length).toBeLessThanOrEqual(100);
    expect(log[log.length - 1].atMs).toBe(4999 * 20);
  });
});
