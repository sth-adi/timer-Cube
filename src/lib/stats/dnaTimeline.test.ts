import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { alignAxes, buildDnaTimeline, choosePeriod, compareSnapshots, morphAxes, traitOf } from "./dnaTimeline";

const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
let n = 0;
const solve = (date: number, timeMs: number): Solve => ({ id: `s${n++}`, sessionId: "a", timeMs, penalty: "none", scramble: "", date });

/** `count` solves on one day, times spread around `mean` by ±`spread`. */
const day = (date: number, count: number, mean: number, spread: number) =>
  Array.from({ length: count }, (_, i) => solve(date + i * 1000, mean + (i % 2 ? spread : -spread)));

describe("DNA timeline", () => {
  it("uses months for a long history and weeks for a short one", () => {
    expect(choosePeriod([solve(at(2026, 0, 1), 1), solve(at(2026, 5, 1), 1)])).toBe("month");
    expect(choosePeriod([solve(at(2026, 0, 1), 1), solve(at(2026, 0, 20), 1)])).toBe("week");
  });

  it("builds one snapshot per period with enough solves, oldest first", () => {
    const solves = [...day(at(2026, 0, 5), 10, 20000, 3000), ...day(at(2026, 1, 5), 3, 18000, 500), ...day(at(2026, 2, 5), 10, 15000, 400)];
    const tl = buildDnaTimeline(solves, "month");
    expect(tl).toHaveLength(2); // February has too few solves
    expect(tl[0].meanMs).toBeCloseTo(20000);
    expect(tl[1].meanMs).toBeCloseTo(15000);
    expect(tl[1].axes.find((a) => a.label === "Consistency")!.score).toBeGreaterThan(tl[0].axes.find((a) => a.label === "Consistency")!.score);
  });

  it("reads the growth between two snapshots", () => {
    const tl = buildDnaTimeline([...day(at(2026, 0, 5), 10, 20000, 3000), ...day(at(2026, 2, 5), 10, 15000, 400)], "month");
    const ev = compareSnapshots(tl[0], tl[1]);
    expect(ev.meanDeltaMs).toBeCloseTo(-5000);
    expect(ev.headline).toMatch(/Average 5\.00s faster/);
    expect(ev.headline).toMatch(/Consistency up/);
    expect(ev.changes[0].delta).not.toBe(0);
  });

  it("names the dominant trait", () => {
    expect(traitOf([{ label: "Speed", score: 60 }, { label: "Consistency", score: 90 }]).name).toBe("The Metronome");
    expect(traitOf([]).name).toBe("Just getting started");
  });

  it("aligns and morphs radars on the axes both snapshots share", () => {
    const a = [{ label: "Speed", score: 40 }, { label: "Consistency", score: 60 }, { label: "Volume", score: 10 }, { label: "Cross", score: 50 }];
    const b = [{ label: "Volume", score: 30 }, { label: "Speed", score: 80 }, { label: "Consistency", score: 70 }];
    expect(alignAxes(a, b).labels).toEqual(["Speed", "Consistency", "Volume"]);
    expect(morphAxes(a, b, 0.5).map((x) => x.score)).toEqual([60, 65, 20]);
  });
});
