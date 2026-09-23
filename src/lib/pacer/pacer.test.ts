import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { invertMoves } from "@/lib/xray/common";
import { DEFAULT_SHAPE, liveMilestones, milestoneTimes, paceLadder, paceVerdict, personalShape, targetSplits } from "./pacer";

const SCRAMBLE = "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'";

describe("milestoneTimes", () => {
  it("finds the cross and each pair, in order", () => {
    const cross = solveCrossOptimal(SCRAMBLE);
    const cube = new Cube();
    cube.move(SCRAMBLE);
    cube.move(cross.join(" "));
    const moves = [...cross, ...solveF2L(cube).flatMap((p) => p.moves)];
    const t = milestoneTimes({ scramble: SCRAMBLE, moves, timesMs: moves.map((_, i) => i * 100) });
    expect(t[0]).toBe((cross.length - 1) * 100);
    for (let k = 1; k <= 4; k++) expect(t[k]!).toBeGreaterThanOrEqual(t[k - 1]!);
    expect(t[4]).toBe((moves.length - 1) * 100);
    expect(t[6]).toBeNull();
  });

  it("marks OLL and the finish on the last layer", () => {
    // A Sune on the engine's last layer (D), undone.
    const sune = ["R", "D", "R'", "D", "R", "D2", "R'"];
    const moves = invertMoves(sune);
    const t = milestoneTimes({ scramble: sune.join(" "), moves, timesMs: moves.map((_, i) => i * 100) });
    expect(t[0]).not.toBeNull();
    expect(t[5]).toBe(600);
    expect(t[6]).toBe(600);
  });

  it("leaves unreached milestones null", () => {
    const t = milestoneTimes({ scramble: SCRAMBLE, moves: ["R"], timesMs: [0] });
    expect(t.every((x) => x === null)).toBe(true);
  });
});

describe("personalShape", () => {
  it("uses the default until there's enough history", () => {
    expect(personalShape([]).shape).toEqual([...DEFAULT_SHAPE]);
    expect(personalShape([]).personal).toBe(false);
  });

  it("learns the median shape", () => {
    const solve = [2000, 4000, 6000, 8000, 10000, 13000, 20000];
    const h = Array.from({ length: 6 }, () => solve);
    const { shape, personal } = personalShape(h);
    expect(personal).toBe(true);
    expect(shape).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 1]);
    expect(targetSplits(10000, shape)).toEqual([1000, 2000, 3000, 4000, 5000, 6500, 10000]);
  });
});

describe("paceLadder", () => {
  it("finds the stretch that lost the most time", () => {
    const targets = [1000, 2000, 3000, 4000, 5000, 6500, 10000];
    const actual = [900, 1800, 3600, 4200, 5400, 6800, 10200];
    const ladder = paceLadder(actual, targets);
    expect(ladder.rows[0].deltaMs).toBe(-100);
    expect(ladder.worst!.milestone).toBe("Pair 2"); // 1800→3600 took 1800 against 1000
    expect(ladder.best!.milestone).toBe("Pair 3");
    expect(paceVerdict(-400)).toBe("ahead");
    expect(paceVerdict(100)).toBe("on");
    expect(paceVerdict(400)).toBe("behind");
  });
});

describe("liveMilestones", () => {
  it("orders pairs and ignores ones before the cross", () => {
    const m = liveMilestones({
      startedAtMs: 1000,
      crossAtMs: 3000,
      f2lPairAtMs: [5000, 2500, null, 4000],
      f2lAtMs: null,
      ollAtMs: null,
      solvedAtMs: null,
    });
    expect(m).toEqual([2000, 2000, 3000, 4000, null, null, null]);
  });
});
