import { describe, expect, it, vi } from "vitest";
import type { Solve } from "@/types";

// Every replay builds cubes, so counting cubes counts replays.
const built = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/cube-engine/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/cube-engine/engine")>();
  return {
    ...real,
    newCube: (...args: Parameters<typeof real.newCube>) => {
      built.count++;
      return real.newCube(...args);
    },
  };
});

import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { mistakeHabits, solveMistakeReport } from "./mistakeRadar";
import { filterAndSort, presentCases, solveSummary } from "./solveFilter";
import { scheduleMistakeHabits, schedulePresentCases } from "./idleWarm";
import type { IdleScheduler } from "./historyStats";

const { scramble, moves } = fullSolveOn("U");
const saved = (id: string, gap = 120): Solve => ({
  id,
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => (i + 1) * gap),
  timeMs: moves.length * gap,
  date: Number(id.replace(/\D/g, "")) || 0,
});
/** Cubes built while `f` runs. */
const cubesBuiltBy = (f: () => void) => {
  const before = built.count;
  f();
  return built.count - before;
};
const now: IdleScheduler = (step) => {
  step(() => 1_000);
  return () => {};
};

describe("per-solve caches", () => {
  it("replays a solve's Mistake Radar once, however often it is asked", () => {
    const s = saved("m1");
    const first = cubesBuiltBy(() => void solveMistakeReport(s));
    expect(first).toBeGreaterThan(0);
    expect(cubesBuiltBy(() => void solveMistakeReport(s))).toBe(0);
    expect(solveMistakeReport(s)).toBe(solveMistakeReport(s));
  });

  it("rolls habits from cached reports: a repeat replays nothing, a new solve costs only itself", () => {
    const solves = ["h1", "h2", "h3", "h4"].map((id) => saved(id));
    const cold = cubesBuiltBy(() => void mistakeHabits(solves));
    expect(cold).toBeGreaterThan(0);
    expect(cubesBuiltBy(() => void mistakeHabits(solves))).toBe(0);
    const one = cubesBuiltBy(() => void solveMistakeReport(saved("h-alone")));
    const extra = saved("h5");
    expect(cubesBuiltBy(() => void mistakeHabits([...solves, extra]))).toBe(one);
    expect(cold).toBe(one * solves.length);
  });

  it("summarises a solve once: filters, sorts and menus over the same solves replay nothing more", () => {
    const solves = ["f1", "f2", "f3"].map((id) => saved(id));
    expect(cubesBuiltBy(() => solves.forEach((s) => solveSummary(s)))).toBeGreaterThan(0);
    expect(solveSummary(solves[0])).toBe(solveSummary(solves[0]));
    const repeat = cubesBuiltBy(() => {
      solves.forEach((s) => solveSummary(s));
      presentCases(solves);
      filterAndSort(solves, { mistake: true }, "oll");
      filterAndSort(solves, {}, "f2l");
    });
    expect(repeat).toBe(0);
    // A new solve costs the same as any one solve did.
    const perSolve = cubesBuiltBy(() => void solveSummary(saved("f-alone")));
    const added = saved("f4");
    expect(cubesBuiltBy(() => void presentCases([...solves, added]))).toBe(perSolve);
  });

  it("sorts by a step exactly as before: slowest first, solves without a breakdown last", () => {
    const keyboard: Solve = { id: "kb", sessionId: "x", penalty: "none", scramble: "R", timeMs: 9000, date: 99 };
    const slow = saved("o1", 200);
    const quick = saved("o2", 100);
    const ids = (sort: Parameters<typeof filterAndSort>[2]) => filterAndSort([quick, keyboard, slow], {}, sort).map((s) => s.id);
    expect(ids("slowest")).toEqual(["o1", "kb", "o2"]);
    expect(ids("fastest")).toEqual(["o2", "kb", "o1"]);
    expect(ids("pll")).toEqual(["o1", "o2", "kb"]);
    expect(ids("recent")).toEqual(["kb", "o2", "o1"]);
  });
});

describe("idle warming", () => {
  it("hands over the same habits and menus the synchronous calls give", () => {
    const solves = ["i1", "i2"].map((id) => saved(id));
    let habits: ReturnType<typeof mistakeHabits> | null = null;
    scheduleMistakeHabits(solves, (h) => (habits = h), now);
    expect(habits).toEqual(mistakeHabits(solves));
    let cases: ReturnType<typeof presentCases> | null = null;
    schedulePresentCases(solves, (c) => (cases = c), now);
    expect(cases).toEqual(presentCases(solves));
  });

  it("never calls back once cancelled", () => {
    const queue: ((b: () => number) => void)[] = [];
    const schedule: IdleScheduler = (step) => {
      queue.push(step);
      return () => {};
    };
    let calls = 0;
    const cancel = scheduleMistakeHabits([saved("c1"), saved("c2")], () => calls++, schedule);
    cancel();
    queue.shift()?.(() => 1_000);
    expect(calls).toBe(0);
  });
});
