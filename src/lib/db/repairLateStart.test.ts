import { afterEach, describe, expect, it, vi } from "vitest";
import type { FullSolve } from "@/types";
import { lateStartRepairPending, markLateStartRepairDone, repairLateStart } from "./repairLateStart";

const base: FullSolve = { id: "a", sessionId: "s", timeMs: 8_000, penalty: "none", scramble: "R U", date: 0 };

describe("repairLateStart", () => {
  it("leaves a solve timed from its first turn alone", () => {
    expect(repairLateStart({ ...base, moveTimestamps: [0, 200, 400] })).toBeNull();
    expect(repairLateStart(base)).toBeNull();
  });

  it("shifts a solve that started at its cross back to its first turn", () => {
    const fixed = repairLateStart({
      ...base,
      timeMs: 8_000,
      crossMs: 0,
      splits: [0, 5_000, 6_500],
      moveTimestamps: [-2_000, -1_000, 0, 4_000, 8_000],
      rotations: [{ atMs: 300, token: "y" }],
      gyroStream: { atMs: [0, 20], qx: [0, 0], qy: [0, 0], qz: [0, 0], qw: [1, 1] },
    });
    expect(fixed).toEqual({
      timeMs: 10_000,
      crossMs: 2_000,
      splits: [2_000, 7_000, 8_500],
      moveTimestamps: [0, 1_000, 2_000, 6_000, 10_000],
      rotations: [{ atMs: 2_300, token: "y" }],
      gyroStream: { atMs: [2_000, 2_020], qx: [0, 0], qy: [0, 0], qz: [0, 0], qw: [1, 1] },
    });
  });
});

describe("late-start repair migration flag", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is pending until marked done, then stays done", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    expect(lateStartRepairPending()).toBe(true);
    markLateStartRepairDone();
    expect(lateStartRepairPending()).toBe(false);
  });

  it("stays pending (and doesn't throw) when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(lateStartRepairPending()).toBe(true);
    expect(() => markLateStartRepairDone()).not.toThrow();
  });
});
