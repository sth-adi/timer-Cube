import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import {
  HandoffTracker,
  MIN_PAIRS,
  buildPauseMap,
  drillEffect,
  drillFor,
  handoffStats,
  pairStretches,
  type PairStretch,
  type SolveCapture,
} from "./pauseMap";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

/**
 * A real cross + F2L for SCRAMBLE, timed: 150ms a turn, `findMs` before each
 * pair's first turn, and a `stallMs` pause before each pair's third turn.
 */
function capture(findMs: number, stallMs = 0, id = "s", date = 1): SolveCapture {
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
      t += j === 0 ? findMs : j === 2 ? 150 + stallMs : 150;
      moves.push(m);
      timesMs.push(t);
    });
  }
  return { id, date, scramble: SCRAMBLE, moves, timesMs };
}

describe("pairStretches", () => {
  it("splits each pair into finding, stalls inside it, and turning", () => {
    const stretches = pairStretches(capture(900, 600));
    expect(stretches.length).toBeGreaterThan(0);
    for (const s of stretches) {
      expect(s.findMs).toBe(900);
      expect(s.stallMs).toBe(s.turns >= 3 ? 750 : 0); // the 750ms gap before the third turn is a stall
      expect(s.turningMs).toBe(s.execMs - s.stallMs);
      expect(s.extraTurns).toBe(Math.max(0, s.turns - s.distance));
    }
  });

  it("starts a drill one stretch early: the scramble for the first pair, the previous pair's start otherwise", () => {
    const stretches = pairStretches(capture(900));
    const first = stretches.find((s) => s.order === 1);
    if (first) expect(first.leadInIndex).toBe(-1);
    for (const s of stretches.filter((x) => x.order > 1)) {
      const prev = stretches.find((p) => p.order === s.order - 1);
      expect(s.leadInIndex).toBe(prev ? prev.fromIndex : s.fromIndex);
    }
  });
});

describe("handoffStats verdicts", () => {
  const stretch = (order: number, findMs: number, extraTurns = 0): PairStretch => ({
    pair: 0,
    order,
    corner: "top",
    edge: "top",
    distance: 6,
    findMs,
    execMs: 1200,
    totalMs: findMs + 1200,
    turns: 6 + extraTurns,
    fromIndex: 0,
    toIndex: 1,
    solveId: "x",
    date: 0,
    stallMs: 0,
    turningMs: 1200,
    extraTurns,
    leadInIndex: 0,
  });
  const many = (n: number, f: (i: number) => PairStretch) => Array.from({ length: n }, (_, i) => f(i));

  it("calls a hand-off where you usually stop to look a finding problem", () => {
    const stats = handoffStats(many(MIN_PAIRS, () => stretch(2, 1100)));
    expect(stats[1]).toMatchObject({ verdict: "finding", stallRate: 1 });
  });

  it("calls quick-to-find but long pairs a solution problem", () => {
    const stats = handoffStats(many(MIN_PAIRS, () => stretch(3, 150, 5)));
    expect(stats[2].verdict).toBe("solution");
  });

  it("gives no verdict on too few pairs, and 'fine' when nothing stands out", () => {
    expect(handoffStats(many(MIN_PAIRS - 1, () => stretch(1, 2000)))[0].verdict).toBeNull();
    expect(handoffStats(many(MIN_PAIRS, () => stretch(4, 150, 1)))[3].verdict).toBe("fine");
  });

  it("an occasional long pause isn't a recurring stall", () => {
    const stats = handoffStats(many(10, (i) => stretch(2, i < 2 ? 3000 : 150)));
    expect(stats[1].stallRate).toBeCloseTo(0.2);
    expect(stats[1].verdict).toBe("fine");
  });
});

describe("buildPauseMap", () => {
  it("names the worst hand-off and picks its real stalls as drill positions", () => {
    const solves = Array.from({ length: MIN_PAIRS }, (_, i) => capture(1200, 0, `s${i}`, i));
    const report = buildPauseMap(solves)!;
    expect(report.worst?.verdict).toBe("finding");
    expect(report.examples.length).toBe(MIN_PAIRS);
    expect(report.examples[0].date).toBe(MIN_PAIRS - 1); // most recent first
    expect(report.headline).toMatch(/stalls/);
  });
});

describe("HandoffTracker (live drill)", () => {
  it("replaying the original solve from the drill's setup measures the same hand-off", () => {
    const solve = capture(1000);
    const stretches = pairStretches(solve);
    const target = stretches.find((s) => s.order > 1 && s.leadInIndex < s.fromIndex) ?? stretches[0];
    const drill = drillFor(target, solve);
    expect(drill.leadIn).toBe(true); // this drill has you finish the previous pair first

    const cube = new Cube();
    cube.move(drill.setupAlg);
    const tracker = new HandoffTracker(drill, 0);
    let result = null;
    for (let i = target.leadInIndex + 1; i < solve.moves.length && !result; i++) {
      cube.move(solve.moves[i]);
      result = tracker.move(cube, solve.timesMs[i]);
    }
    expect(result).toEqual({ findMs: target.findMs, totalMs: target.totalMs, turns: target.turns, multislot: false });
  });

  it("without a lead-in, the hand-off is the moment the setup is ready", () => {
    const tracker = new HandoffTracker({ pairsAtHandoff: 0, leadIn: false }, 5000);
    expect(tracker.phase).toBe("finding");
  });
});

describe("drillEffect", () => {
  const at = (date: number, findMs: number) =>
    ({ order: 2, date, findMs }) as PairStretch;

  it("compares real solves before and after you started drilling, with sample sizes", () => {
    const stretches = [...Array.from({ length: 12 }, (_, i) => at(i, 1000)), ...Array.from({ length: 12 }, (_, i) => at(100 + i, 300))];
    const e = drillEffect(stretches, 2, 100);
    expect(e.before).toMatchObject({ pairs: 12, findMs: 1000, stallRate: 1 });
    expect(e.after).toMatchObject({ pairs: 12, findMs: 300, stallRate: 0 });
    expect(e.enough).toBe(true);
  });

  it("won't call it on a handful of solves", () => {
    const stretches = [...Array.from({ length: 12 }, (_, i) => at(i, 1000)), at(100, 300), at(101, 300)];
    expect(drillEffect(stretches, 2, 100).enough).toBe(false);
  });
});
