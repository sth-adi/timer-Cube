import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { MIN_TURNS_PER_FACE, computeAxisBias, computeDirectionBias, computeSpinReport } from "./spin";
import type { FaceSpeedStat } from "./smartCubeInsights";

function makeSolve(overrides: Partial<Solve>): Solve {
  return { id: "s1", sessionId: "sess1", timeMs: 10000, penalty: "none", scramble: "R U R' U'", date: 1, ...overrides };
}

describe("computeDirectionBias", () => {
  it("splits cw (plain) from ccw (') turns and skips the first move of a solve", () => {
    // R at 0 (first move, skipped), R' at 100 (gap 100, ccw), R at 150 (gap 50, cw)
    const solves = [makeSolve({ reconstruction: "R R' R", moveTimestamps: [0, 100, 150] })];
    const dirs = computeDirectionBias(solves);
    const cw = dirs.find((d) => d.direction === "cw")!;
    const ccw = dirs.find((d) => d.direction === "ccw")!;
    expect(cw.turnCount).toBe(1);
    expect(cw.avgGapMs).toBeCloseTo(50);
    expect(ccw.turnCount).toBe(1);
    expect(ccw.avgGapMs).toBeCloseTo(100);
  });

  it("ignores half turns (no direction) and pauses (gap >= PAUSE_MS)", () => {
    // U2 has no direction; R' arrives after a 4900ms pause, which isn't a turn either.
    const solves = [makeSolve({ reconstruction: "R U2 R'", moveTimestamps: [0, 100, 5000] })];
    const dirs = computeDirectionBias(solves);
    expect(dirs.find((d) => d.direction === "ccw")).toBeUndefined();
  });
});

describe("computeAxisBias", () => {
  const stat = (face: FaceSpeedStat["face"], avgGapMs: number, turnCount = MIN_TURNS_PER_FACE): FaceSpeedStat => ({ face, avgGapMs, turnCount, pausesBefore: 0 });

  it("names the slower and faster face of a qualifying axis, with the gap between them", () => {
    const axes = computeAxisBias([stat("R", 300), stat("L", 200), stat("U", 150), stat("D", 180)]);
    const rl = axes.find((a) => a.axis === "RL")!;
    expect(rl.slowerFace).toBe("R");
    expect(rl.fasterFace).toBe("L");
    expect(rl.diffMs).toBeCloseTo(100);
    const ud = axes.find((a) => a.axis === "UD")!;
    expect(ud.slowerFace).toBe("D");
  });

  it("skips an axis where either face is under the turn-count floor", () => {
    const axes = computeAxisBias([stat("R", 300), stat("L", 200, MIN_TURNS_PER_FACE - 1)]);
    expect(axes.find((a) => a.axis === "RL")).toBeUndefined();
  });
});

describe("computeSpinReport", () => {
  it("returns null with nothing to compare", () => {
    expect(computeSpinReport([makeSolve({})])).toBeNull();
  });

  it("reports a genuine direction bias", () => {
    // Seed move (skipped, no gap), then alternating: a slow gap before every
    // R' (ccw) and a fast gap before every R (cw).
    const tokens: string[] = ["R"];
    const times: number[] = [0];
    let t = 0;
    for (let i = 0; i < 29; i++) {
      t += 300;
      tokens.push("R'"); // gap before this ccw turn: 300 (slow)
      times.push(t);
      t += 60;
      tokens.push("R"); // gap before this cw turn: 60 (fast)
      times.push(t);
    }
    const report = computeSpinReport([makeSolve({ reconstruction: tokens.join(" "), moveTimestamps: times })])!;
    expect(report).not.toBeNull();
    expect(report.directionBiasMs).toBeGreaterThan(50);
    expect(report.headline).toMatch(/counter-clockwise turns average/);
  });
});
