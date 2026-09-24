import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { MIN_EVENTS, f2lInsertionEvents, groupInsertions, summarizeInsertions, type InsertionEvent } from "./multislot";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

describe("groupInsertions", () => {
  it("splits four solo insertions into four one-pair events", () => {
    // counts stay flat, then jump by 1 at indices 3, 5, 8, 10 (crossIdx = 0).
    const counts = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4];
    const times = counts.map((_, i) => i * 100);
    const events = groupInsertions(0, counts, times);
    expect(events).toEqual([
      { pairs: 1, turns: 3, ms: 300 },
      { pairs: 1, turns: 2, ms: 200 },
      { pairs: 1, turns: 3, ms: 300 },
      { pairs: 1, turns: 2, ms: 200 },
    ]);
  });

  it("a count that jumps by 2 or 3 in one step is a multi-pair event", () => {
    const counts = [0, 0, 0, 2, 2, 3, 3, 3]; // jump 0->2, then 2->3
    const times = counts.map((_, i) => i * 100);
    expect(groupInsertions(0, counts, times)).toEqual([
      { pairs: 2, turns: 3, ms: 300 },
      { pairs: 1, turns: 2, ms: 200 },
    ]);
    const allAtOnce = [0, 0, 4]; // all four pairs land on one move
    expect(groupInsertions(0, allAtOnce, allAtOnce.map((_, i) => i * 50))).toEqual([{ pairs: 4, turns: 2, ms: 100 }]);
  });

  it("stops once all four pairs are in, even if the array runs on", () => {
    const counts = [0, 1, 2, 3, 4, 4, 4];
    const events = groupInsertions(0, counts, counts.map((_, i) => i));
    expect(events).toHaveLength(4);
  });

  it("pairs already solved by crossIdx don't generate an event", () => {
    const counts = [1, 1, 2, 2]; // starts at 1 pair already free
    const events = groupInsertions(0, counts, counts.map((_, i) => i * 10));
    expect(events).toEqual([{ pairs: 1, turns: 2, ms: 20 }]);
  });
});

describe("f2lInsertionEvents", () => {
  it("a normal one-pair-at-a-time solve is all solo events", () => {
    const cross = solveCrossOptimal(SCRAMBLE);
    const cube = new Cube();
    cube.move(SCRAMBLE);
    cube.move(cross.join(" "));
    const pairs = solveF2L(cube).map((p) => p.moves).filter((m) => m.length);
    const moves: string[] = [...cross];
    const times: number[] = cross.map((_, i) => i * 150);
    let t = times[times.length - 1] ?? 0;
    for (const pair of pairs) {
      pair.forEach((m, j) => {
        t += j === 0 ? 400 : 150;
        moves.push(m);
        times.push(t);
      });
    }
    const events = f2lInsertionEvents(SCRAMBLE, moves, times);
    expect(events.length).toBe(pairs.length);
    expect(events.every((e) => e.pairs === 1)).toBe(true);
  });

  it("returns [] without a cross, or on mismatched lengths", () => {
    expect(f2lInsertionEvents(SCRAMBLE, ["R"], [0])).toEqual([]);
    expect(f2lInsertionEvents(SCRAMBLE, ["R", "U"], [0])).toEqual([]);
    expect(f2lInsertionEvents(SCRAMBLE, [], [])).toEqual([]);
  });
});

describe("summarizeInsertions", () => {
  const solo = (n: number, turns: number, ms: number): InsertionEvent[] => Array.from({ length: n }, () => ({ pairs: 1, turns, ms }));
  const multi = (n: number, pairs: number, turns: number, ms: number): InsertionEvent[] => Array.from({ length: n }, () => ({ pairs, turns, ms }));

  it("returns null under MIN_EVENTS", () => {
    expect(summarizeInsertions(solo(MIN_EVENTS - 1, 6, 900))).toBeNull();
  });

  it("still reports when every insertion was solo — never multi-slotting is a real finding, not missing data", () => {
    const report = summarizeInsertions(solo(MIN_EVENTS + 5, 6, 900))!;
    expect(report).not.toBeNull();
    expect(report.soloEvents).toBe(MIN_EVENTS + 5);
    expect(report.multiEvents).toBe(0);
    expect(report.multiPairShare).toBe(0);
    expect(report.faster).toBeNull();
    expect(report.headline).toMatch(/you don't multi-slot pairs/);
  });

  it("computes per-pair turns/ms and calls multi-slotting faster when it genuinely is", () => {
    // Solo: 6 turns / 900ms per pair. Multi: 2 pairs in 10 turns / 1200ms -> 5 turns/600ms per pair.
    const events = [...solo(10, 6, 900), ...multi(6, 2, 10, 1200)];
    const report = summarizeInsertions(events)!;
    expect(report.soloEvents).toBe(10);
    expect(report.multiEvents).toBe(6);
    expect(report.avgTurnsPerPairSolo).toBeCloseTo(6);
    expect(report.avgMsPerPairSolo).toBeCloseTo(900);
    expect(report.avgTurnsPerPairMulti).toBeCloseTo(5);
    expect(report.avgMsPerPairMulti).toBeCloseTo(600);
    expect(report.faster).toBe("multi");
    expect(report.headline).toMatch(/genuinely saving/);
    // 12 multi pairs out of 10 solo + 12 multi = 22 total.
    expect(report.multiPairShare).toBeCloseTo(12 / 22);
  });

  it("calls it out when multi-slotting is actually costing more", () => {
    const events = [...solo(10, 6, 900), ...multi(6, 2, 16, 2400)]; // 8 turns/1200ms per pair, worse than solo
    const report = summarizeInsertions(events)!;
    expect(report.faster).toBe("solo");
    expect(report.headline).toMatch(/costing more than it saves/);
  });
});
