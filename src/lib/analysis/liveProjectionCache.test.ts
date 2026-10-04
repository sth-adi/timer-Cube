import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Solve } from "@/types";

// Count the expensive replays without changing what they return.
vi.mock("@/lib/pacer/pacer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pacer/pacer")>();
  return { ...actual, milestoneTimes: vi.fn(actual.milestoneTimes) };
});

import { milestoneTimes } from "@/lib/pacer/pacer";
import { formatProjectedMs, hasCachedMilestones, resetMilestoneCacheForTests, solveMilestoneTimes, warmMilestoneCache } from "./liveProjection";

const replays = vi.mocked(milestoneTimes);

const MOVES = "R U R' U' F' U F R2 D L'".split(" ");
function makeSolve(id: string, extra: Partial<Solve> = {}): Solve {
  return {
    id,
    sessionId: "s1",
    timeMs: 9000,
    penalty: "none",
    scramble: "R U R' U' F' U F R2 D L'",
    reconstruction: MOVES.join(" "),
    moveTimestamps: MOVES.map((_, i) => i * 300),
    date: 1,
    ...extra,
  };
}
const makeSolves = (n: number, prefix = "a") => Array.from({ length: n }, (_, i) => makeSolve(`${prefix}${i}`));

beforeEach(() => {
  resetMilestoneCacheForTests();
  replays.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("solveMilestoneTimes cache", () => {
  it("replays a solve once, however many times the model is rebuilt", () => {
    const solve = makeSolve("x");
    const first = solveMilestoneTimes(solve);
    expect(solveMilestoneTimes(solve)).toBe(first);
    expect(replays).toHaveBeenCalledTimes(1);
  });

  it("is keyed by solve id: a re-read row with the same content hits, a new solve replays only itself", () => {
    const solves = makeSolves(5);
    solves.forEach(solveMilestoneTimes);
    expect(replays).toHaveBeenCalledTimes(5);
    // Same ids, fresh objects and arrays (what a reload from storage produces).
    const reread = solves.map((s) => ({ ...s, moveTimestamps: [...s.moveTimestamps!] }));
    [...reread, makeSolve("new")].forEach(solveMilestoneTimes);
    expect(replays).toHaveBeenCalledTimes(6);
  });

  it("recomputes when the stored content under an id actually changed", () => {
    solveMilestoneTimes(makeSolve("x"));
    const edited = makeSolve("x", { reconstruction: MOVES.slice(0, 9).join(" "), moveTimestamps: MOVES.slice(0, 9).map((_, i) => i * 300) });
    expect(hasCachedMilestones(edited)).toBe(false);
    solveMilestoneTimes(edited);
    expect(replays).toHaveBeenCalledTimes(2);
  });
});

describe("warmMilestoneCache", () => {
  it("fills the cache in idle time, so the first read during a solve replays nothing", () => {
    const solves = makeSolves(30);
    warmMilestoneCache(solves);
    // Nothing runs synchronously — it waits for idle time.
    expect(replays).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(replays).toHaveBeenCalledTimes(30);

    replays.mockClear();
    const history = solves.map(solveMilestoneTimes); // what LiveProjection's first mount does
    expect(history).toHaveLength(30);
    expect(replays).not.toHaveBeenCalled();
  });

  it("only works on what's missing, and skips solves the projection ignores", () => {
    const solves = [...makeSolves(4), makeSolve("dnf", { penalty: "dnf" }), makeSolve("manual", { reconstruction: undefined, moveTimestamps: undefined })];
    solveMilestoneTimes(solves[0]);
    replays.mockClear();
    warmMilestoneCache(solves);
    vi.runAllTimers();
    expect(replays).toHaveBeenCalledTimes(3);
    // A second warm-up with nothing new schedules nothing at all.
    replays.mockClear();
    warmMilestoneCache(solves);
    expect(vi.getTimerCount()).toBe(0);
    expect(replays).not.toHaveBeenCalled();
  });

  it("works in slices of the idle budget rather than one long task", () => {
    // An idle period that runs out after a few calls to timeRemaining().
    vi.stubGlobal("requestIdleCallback", (cb: (d: { timeRemaining: () => number; didTimeout: boolean }) => void) =>
      setTimeout(() => {
        let left = 7;
        cb({ didTimeout: false, timeRemaining: () => (left -= 2) });
      }, 0),
    );
    vi.stubGlobal("cancelIdleCallback", (h: ReturnType<typeof setTimeout>) => clearTimeout(h));
    try {
      warmMilestoneCache(makeSolves(40));
      vi.advanceTimersToNextTimer();
      const firstSlice = replays.mock.calls.length;
      expect(firstSlice).toBeGreaterThanOrEqual(1);
      expect(firstSlice).toBeLessThan(10);
      vi.runAllTimers();
      expect(replays).toHaveBeenCalledTimes(40);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("can be cancelled when the list changes again", () => {
    const cancel = warmMilestoneCache(makeSolves(10));
    cancel();
    vi.runAllTimers();
    expect(replays).not.toHaveBeenCalled();
  });
});

describe("formatProjectedMs", () => {
  it("rounds to a tenth", () => {
    expect(formatProjectedMs(12340)).toBe("12.3");
    expect(formatProjectedMs(12351)).toBe("12.4");
    expect(formatProjectedMs(9960)).toBe("10.0");
    expect(formatProjectedMs(0)).toBe("0.0");
  });

  it("rolls over into minutes", () => {
    expect(formatProjectedMs(59960)).toBe("1:00.0");
    expect(formatProjectedMs(65400)).toBe("1:05.4");
  });
});
