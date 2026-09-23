import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { buildBlindSpots, pairSegments, type PairSegment } from "./blindSpots";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

/** A cross + F2L capture: 150ms a turn, with `findMs` of thinking before each pair's first turn. */
function capture(findMs: number) {
  const cross = solveCrossOptimal(SCRAMBLE);
  const cube = new Cube();
  cube.move(SCRAMBLE);
  cube.move(cross.join(" "));
  const pairs = solveF2L(cube);
  const moves: string[] = [...cross];
  const timesMs: number[] = cross.map((_, i) => i * 150);
  let t = timesMs[timesMs.length - 1];
  for (const p of pairs) {
    p.moves.forEach((m, j) => {
      t += j === 0 ? findMs : 150;
      moves.push(m);
      timesMs.push(t);
    });
  }
  return { scramble: SCRAMBLE, moves, timesMs, pairs };
}

describe("pairSegments", () => {
  it("splits F2L into pairs with find and execution time", () => {
    const { pairs, ...input } = capture(1000);
    const segs = pairSegments(input);
    const nonEmpty = pairs.filter((p) => p.moves.length > 0).length;
    expect(segs.length).toBe(nonEmpty);
    for (const s of segs) {
      expect(s.findMs).toBe(1000);
      expect(s.totalMs).toBe(1000 + (s.turns - 1) * 150);
      expect(["top", "slot", "home"]).toContain(s.corner);
      expect(s.distance).toBeGreaterThan(0);
    }
    expect(segs.map((s) => s.order)).toEqual(segs.map((_, i) => i + 1 + (4 - nonEmpty)));
  });

  it("returns nothing without a cross", () => {
    expect(pairSegments({ scramble: SCRAMBLE, moves: ["R"], timesMs: [0] })).toEqual([]);
  });
});

describe("buildBlindSpots", () => {
  const seg = (corner: PairSegment["corner"], edge: PairSegment["edge"], findMs: number, pair = 0): PairSegment => ({
    pair,
    order: 1,
    corner,
    edge,
    distance: 5,
    findMs,
    execMs: 800,
    totalMs: findMs + 800,
    turns: 7,
  });

  it("flags the situation that's slow to find", () => {
    const solves = [
      [seg("top", "top", 300), seg("top", "top", 350), seg("top", "slot", 1400)],
      [seg("top", "top", 320), seg("top", "slot", 1500), seg("top", "slot", 1300, 2)],
    ];
    const r = buildBlindSpots(solves)!;
    expect(r.pairs).toBe(6);
    expect(r.solves).toBe(2);
    expect(r.cells).toHaveLength(9);
    expect(r.insights[0].label).toBe("Corner up top, edge in another slot");
    expect(r.insights[0].metric).toBe("findMs");
    expect(r.byPair[2].count).toBe(1);
  });

  it("is null with no data", () => {
    expect(buildBlindSpots([])).toBeNull();
  });
});
