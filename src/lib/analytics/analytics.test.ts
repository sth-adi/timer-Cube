import { describe, expect, it } from "vitest";
import { invertMoves } from "@/lib/xray/common";
import type { Solve } from "@/types";
import { solveMetrics, type SolveMetrics } from "./solveMetrics";
import { buildAutopsy } from "./autopsy";
import { buildConsistency } from "./consistency";
import { buildProgress, fitCurve, solvesToReach } from "./progress";
import { buildStamina, sittings } from "./stamina";

// Engine frame (last layer on D): Sune and T-perm.
const SUNE = "R D R' D R D2 R'".split(" ");
const TPERM = "R D R' D' R' B R2 D' R' D' R D R' B'".split(" ");

describe("solveMetrics", () => {
  it("splits a real capture into phases and reads the scramble's luck", () => {
    const moves = ["F2", ...SUNE, ...TPERM, "D'"];
    const timesMs = moves.map((_, i) => i * 150 + (i >= 8 ? 900 : 0));
    const solve: Solve = {
      id: "a",
      sessionId: "s",
      timeMs: timesMs[timesMs.length - 1],
      penalty: "none",
      scramble: invertMoves(moves).join(" "),
      date: 1,
      reconstruction: moves.join(" "),
      moveTimestamps: timesMs,
    };
    const m = solveMetrics(solve)!;
    expect(m.phases.reduce((a, b) => a + b, 0)).toBe(solve.timeMs);
    expect(m.phases[0]).toBe(0);
    expect(m.crossOptimal).toBe(1);
    expect(m.freePairs).toBe(2);
    expect(m.ollSkip).toBe(false);
    expect(m.pllSkip).toBe(false);
    expect(m.pauseCount).toBe(1);
    expect(m.pauseMs).toBe(1050);
    expect(m.execTps).toBeCloseTo(1000 / 150, 5);
  });
});

/** Synthetic metrics: F2L carries the variation (and the pausing), the other phases are steady. */
function synth(n: number, opts: { f2l?: (i: number) => number; date?: (i: number) => number } = {}): SolveMetrics[] {
  return Array.from({ length: n }, (_, i) => {
    const f2l = opts.f2l ? opts.f2l(i) : 6000 + ((i * 7919) % 11) * 300;
    const phases: [number, number, number, number] = [1500 + (i % 3) * 30, f2l, 2000 + (i % 2) * 40, 1500 + (i % 3) * 20];
    const totalMs = phases.reduce((a, b) => a + b, 0);
    return {
      id: `s${i}`,
      date: opts.date ? opts.date(i) : 1_700_000_000_000 + i * 40_000,
      totalMs,
      phases,
      turns: 55,
      tps: 55 / (totalMs / 1000),
      execTps: 8,
      pauseMs: f2l - 4000,
      pauseCount: 4,
      longestPauseMs: 600,
      f2lPauseMs: f2l - 4000,
      rotations: null,
      crossOptimal: 5 + (i % 3),
      freePairs: 0,
      ollSkip: false,
      pllSkip: false,
    };
  });
}

describe("buildAutopsy", () => {
  it("pins the gap on F2L pausing, not luck", () => {
    const a = buildAutopsy(synth(40))!;
    expect(a.groupSize).toBe(10);
    expect(a.gapMs).toBeGreaterThan(0);
    expect(a.phaseGap.reduce((s, p) => s + p.ms, 0)).toBeCloseTo(a.gapMs, 5);
    expect([...a.phaseGap].sort((x, y) => y.ms - x.ms)[0].phase).toBe("F2L");
    expect(["phase-F2L", "pause", "f2lPause"]).toContain(a.factors[0].key);
    expect(a.headline).toMatch(/F2L/);
    expect(buildAutopsy(synth(5))).toBeNull();
  });
});

describe("buildConsistency", () => {
  it("attributes the variance to the phase that varies", () => {
    const c = buildConsistency(synth(30))!;
    const shares = c.phases.map((p) => p.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(c.wildest).toBe("F2L");
    expect(c.whatIf[0].phase).toBe("F2L");
    expect(c.whatIf[0].sd).toBeLessThan(c.totalSd);
    expect(c.headline).toMatch(/comes from F2L/);
  });
});

describe("progress", () => {
  it("recovers a power-law learning curve and forecasts a goal", () => {
    const ys = Array.from({ length: 200 }, (_, i) => 30000 * (i + 1) ** -0.2);
    const curve = fitCurve(ys);
    expect(curve.p).toBeCloseTo(0.2, 3);
    expect(curve.c).toBeCloseTo(30000, 0);
    expect(curve.plateau).toBe(false);
    // 30000·n^-0.2 = 10000 at n = 3^5 = 243.
    expect(solvesToReach(curve, 200, 10000)).toBe(43);
  });

  it("calls a flat history a plateau", () => {
    expect(fitCurve(Array.from({ length: 60 }, (_, i) => 12000 + ((i * 37) % 7) * 100)).plateau).toBe(true);
  });

  it("builds a report with a next goal", () => {
    const r = buildProgress(synth(60, { f2l: (i) => 9000 * (i + 1) ** -0.15 }))!;
    expect(r.phases.find((p) => p.phase === "F2L")!.p).toBeGreaterThan(0.1);
    expect(r.forecast).not.toBeNull();
    expect(r.forecast!.goalMs).toBeLessThan(r.overall.current);
    expect(r.rolling).toHaveLength(60);
  });
});

describe("stamina", () => {
  // 4 sittings of 12 solves, a day apart; the first two of each are 15% slow in the cross.
  const day = 86_400_000;
  const metrics = Array.from({ length: 4 }, (_, s) =>
    synth(12, { f2l: () => 6000, date: (i) => 1_700_000_000_000 + s * day + i * 30_000 }).map((m, i) => {
      if (i >= 2) return { ...m, id: `${s}-${i}` };
      const phases: [number, number, number, number] = [m.phases[0] * 2.5, m.phases[1], m.phases[2], m.phases[3]];
      return { ...m, id: `${s}-${i}`, phases, totalMs: phases.reduce((a, b) => a + b, 0) };
    }),
  ).flat();

  it("splits sittings on long gaps", () => {
    expect(sittings(metrics)).toHaveLength(4);
  });

  it("finds the warm-up and the cold phase", () => {
    const r = buildStamina(metrics)!;
    expect(r.sittings).toBe(4);
    expect(r.warmupSolves).toBe(2);
    expect(r.coldPenalty).toBeGreaterThan(0.1);
    expect(r.coldestPhase!.phase).toBe("Cross");
    expect(r.coldestPhase!.ms).toBeGreaterThan(1500);
    expect(r.headline).toMatch(/Cross is the coldest phase/);
    expect(r.headline).toMatch(/first 2 solves/);
    expect(r.positions[0].count).toBe(4);
  });
});
