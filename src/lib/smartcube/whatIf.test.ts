import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { planFromFacelets } from "@/lib/satnav/planner";
import { applyTurns, completeFrom, msPerTurnAfter, originalRemainder, stateAt, verdict } from "./whatIf";

const SCRAMBLE = "R U R' U' F2 D L' B2 R2 U F' L2 D2 B";

describe("what-if branching", () => {
  it("replays the solve to the fork point", () => {
    const moves = ["R", "U", "F'"];
    expect(stateAt(SCRAMBLE, moves, 2)).toBe(applyTurns(stateAt(SCRAMBLE, [], 0), ["R", "U"]));
  });

  it("measures what actually happened after the fork", () => {
    const times = [500, 900, 1300, 2000];
    expect(originalRemainder(times, 2500, 1)).toEqual({ turns: 3, ms: 2000 });
    expect(originalRemainder(times, 2500, 0)).toEqual({ turns: 4, ms: 2500 });
    // Too little left to measure → whole-solve pace.
    expect(msPerTurnAfter(times, 2500, 1)).toBe(2500 / 4);
  });

  it("has the Sat-Nav finish any branch all the way to solved", async () => {
    const start = stateAt(SCRAMBLE, [], 0);
    const branch = applyTurns(start, ["F", "R2"]);
    const done = await completeFrom(branch, planFromFacelets);
    expect(done.solved).toBe(true);
    expect(done.legs[0].stage).toBe("cross");
    expect(done.legs.map((l) => l.stage)).toContain("f2l");
    const end = applyTurns(
      branch,
      done.legs.flatMap((l) => l.turns),
    );
    expect(Cube.fromString(end).isSolved()).toBe(true);
    expect(done.turns).toBe(done.legs.reduce((a, l) => a + l.turns.length, 0));
  }, 30000);

  it("reports a solved fork as already done", async () => {
    const done = await completeFrom(stateAt("", [], 0), planFromFacelets);
    expect(done).toEqual({ legs: [], turns: 0, solved: true });
  });

  it("prices the difference at your own pace", () => {
    expect(verdict({ turns: 40, ms: 10000 }, 36, 250)).toMatchObject({ turnDelta: -4, msDelta: -1000 });
    expect(verdict({ turns: 40, ms: 10000 }, 36, 250).line).toMatch(/4 turns shorter.*1\.00s faster/);
    expect(verdict({ turns: 40, ms: 10000 }, 41, 250).line).toMatch(/1 turn longer/);
  });
});
