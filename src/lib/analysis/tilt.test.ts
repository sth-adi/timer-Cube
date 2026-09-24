import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { solveOLL } from "@/lib/solvers/oll";
import { solvePLL } from "@/lib/solvers/pll";
import { simplify } from "@/lib/smartcube/route";
import { analyzeMistakes } from "@/lib/analysis/mistakeRadar";
import { MIN_SAMPLE, aggregateTilt, analyzeTilt, type TiltEntry } from "./tilt";

describe("aggregateTilt", () => {
  it("returns null when either bucket is under MIN_SAMPLE", () => {
    const mistake: TiltEntry[] = Array.from({ length: MIN_SAMPLE }, () => ({ hasMistake: true, ratio: 1.3 }));
    const clean: TiltEntry[] = Array.from({ length: MIN_SAMPLE - 1 }, () => ({ hasMistake: false, ratio: 1 }));
    expect(aggregateTilt([...mistake, ...clean])).toBeNull();
  });

  it("flags a tilt when after-mistake phases genuinely run slower", () => {
    const mistake: TiltEntry[] = Array.from({ length: MIN_SAMPLE + 2 }, () => ({ hasMistake: true, ratio: 1.25 }));
    const clean: TiltEntry[] = Array.from({ length: MIN_SAMPLE + 2 }, () => ({ hasMistake: false, ratio: 1.0 }));
    const report = aggregateTilt([...mistake, ...clean])!;
    expect(report).not.toBeNull();
    expect(report.sampleSize).toBe(MIN_SAMPLE + 2);
    expect(report.controlSize).toBe(MIN_SAMPLE + 2);
    expect(report.afterMistakeAvgRatio).toBeCloseTo(1.25);
    expect(report.afterCleanAvgRatio).toBeCloseTo(1.0);
    expect(report.tilts).toBe(true);
    expect(report.headline).toMatch(/you tilt/i);
  });

  it("does not flag a tilt when the gap is under the threshold", () => {
    const mistake: TiltEntry[] = Array.from({ length: MIN_SAMPLE + 2 }, () => ({ hasMistake: true, ratio: 1.02 }));
    const clean: TiltEntry[] = Array.from({ length: MIN_SAMPLE + 2 }, () => ({ hasMistake: false, ratio: 1.0 }));
    const report = aggregateTilt([...mistake, ...clean])!;
    expect(report.tilts).toBe(false);
    expect(report.headline).toMatch(/recover cleanly/i);
  });
});

describe("analyzeTilt", () => {
  it("returns null under MIN_SAMPLE analyzable solves", () => {
    expect(analyzeTilt([])).toBeNull();
  });

  // solveOLL is a from-scratch bounded search that only finds a solution for
  // a minority of random last-layer states within its budget (the trainer's
  // own tests note roughly a 1-in-5 hit rate and retry accordingly — see
  // trainerState.test.ts), and even a hit can naturally break the cross for
  // several moves mid-F2L (a real, not injected, Mistake Radar flag). One
  // scramble that stages cleanly is all this test needs — every synthetic
  // solve below reuses it — pre-verified so the suite doesn't re-search on
  // every run; two backups follow in case engine internals ever shift this.
  const SCRAMBLE_POOL = [
    "U2 L2 D R2 U' B2 L2 D R2 U' R2 U2 B' R' D' B' R' D2 L R' U2",
    "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
    "D2 B2 U' R2 U F2 D L2 U' B2 R' D' F L2 U2 B' R' F' U'",
  ];

  interface Segments {
    cross: string[];
    f2l: string[];
    oll: string[];
    pll: string[];
  }

  /**
   * Each phase is solved by its own separate search, and a real F2L solve
   * can genuinely displace an already-solved cross edge for several moves
   * before restoring it — both can trip Mistake Radar's own rules (a same-face
   * join between two searches, a cross edge out for BREAK_MIN_MOVES+) even
   * with no mistake injected. `simplify` removes same-face joins within a
   * phase; this replays the *un-injected* solve through Mistake Radar itself
   * and rejects any scramble whose baseline solve isn't clean, so only the
   * mistake this test deliberately inserts ever gets flagged.
   */
  function isGenuinelyClean(scramble: string, segs: Segments): boolean {
    const moves = [...segs.cross, ...segs.f2l, ...segs.oll, ...segs.pll];
    const timesMs = moves.map((_, i) => (i + 1) * 150);
    const report = analyzeMistakes({ scramble, moves, timesMs, totalMs: timesMs[timesMs.length - 1] });
    return report.mistakes.length === 0;
  }

  function segmentsFor(scramble: string): Segments | null {
    try {
      const cube = new Cube();
      cube.move(scramble);
      const cross = simplify(solveCrossOptimal(scramble));
      cube.move(cross.join(" "));
      const f2l = simplify(
        solveF2L(cube)
          .map((p) => p.moves)
          .filter((m) => m.length)
          .flat(),
      );
      const oll = simplify(solveOLL(cube));
      const pll = simplify(solvePLL(cube));
      if (oll.length === 0 || !cube.isSolved()) return null;
      const segs = { cross, f2l, oll, pll };
      if (!isGenuinelyClean(scramble, segs)) return null;
      return segs;
    } catch {
      return null;
    }
  }

  function findWorkingScramble(): Segments & { scramble: string } {
    for (const scramble of SCRAMBLE_POOL) {
      const segs = segmentsFor(scramble);
      if (segs) return { ...segs, scramble };
    }
    throw new Error(`no usable scramble in a pool of ${SCRAMBLE_POOL.length}`);
  }

  /**
   * A genuine full CFOP solve reusing precomputed cross/F2L/OLL/PLL segments
   * for one working scramble, with each phase stretched to take exactly
   * `phaseMs.<phase>` (moves evenly spaced across it). When `mistakePhase`
   * is set, a same-face cancelling pair ("R R'" — net zero, so the final
   * solved state is unaffected) is inserted at the start of that phase's
   * moves, which Mistake Radar's wasted-turns check flags as a mistake in
   * exactly that phase.
   */
  function buildFullSolve(
    id: string,
    scramble: string,
    segs: Segments,
    phaseMs: { cross: number; f2l: number; oll: number; pll: number },
    mistakePhase?: "Cross" | "F2L" | "OLL",
  ): Solve {
    const withMistake = (phase: string, moves: readonly string[]) => (mistakePhase === phase ? ["R", "R'", ...moves] : [...moves]);
    const stretches: { moves: string[]; totalMs: number }[] = [
      { moves: withMistake("Cross", segs.cross), totalMs: phaseMs.cross },
      { moves: withMistake("F2L", segs.f2l), totalMs: phaseMs.f2l },
      { moves: withMistake("OLL", segs.oll), totalMs: phaseMs.oll },
      { moves: [...segs.pll], totalMs: phaseMs.pll },
    ];

    const moves: string[] = [];
    const timesMs: number[] = [];
    let t = 0;
    for (const { moves: segMoves, totalMs } of stretches) {
      const gap = segMoves.length > 0 ? totalMs / segMoves.length : 0;
      for (const m of segMoves) {
        t += gap;
        moves.push(m);
        timesMs.push(Math.round(t));
      }
    }

    return {
      id,
      sessionId: "s",
      timeMs: timesMs[timesMs.length - 1],
      penalty: "none",
      scramble,
      date: Number(id),
      reconstruction: moves.join(" "),
      moveTimestamps: timesMs,
    };
  }

  it(
    "finds a genuine tilt: OLL runs slower in solves with a flagged F2L mistake",
    () => {
      const { scramble, ...segs } = findWorkingScramble();
      const CLEAN_MS = { cross: 1000, f2l: 3000, oll: 2000, pll: 1800 };
      const MISTAKE_MS = { cross: 1000, f2l: 3000, oll: 4000, pll: 1800 };
      const solves: Solve[] = [];
      const n = MIN_SAMPLE + 2;
      for (let i = 0; i < n; i++) {
        solves.push(buildFullSolve(`clean-${i}`, scramble, segs, CLEAN_MS));
        solves.push(buildFullSolve(`mistake-${i}`, scramble, segs, MISTAKE_MS, "F2L"));
      }

      const report = analyzeTilt(solves)!;
      expect(report).not.toBeNull();
      expect(report.sampleSize).toBeGreaterThanOrEqual(MIN_SAMPLE);
      expect(report.controlSize).toBeGreaterThanOrEqual(MIN_SAMPLE);
      expect(report.afterMistakeAvgRatio).toBeGreaterThan(report.afterCleanAvgRatio + 0.08);
      expect(report.tilts).toBe(true);
    },
    60_000,
  );
});
