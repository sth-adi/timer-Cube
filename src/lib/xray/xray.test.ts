import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L, solvePairFromCube } from "@/lib/solvers/f2l";
import { F2L_PAIRS, pairHeuristic, type PairId } from "@/lib/solvers/data/pieceTablesClient";
import { bottomLayerSolved, f2lPairSolved } from "@/lib/solvers/oll";
import { physicalFaceAt, viewerMove } from "@/lib/gyro/orientation";
import { YELLOW_TOP_GRIPS, colorOnTopGrip, inGrip, invertMoves, slotGrip } from "./common";
import { analyzeF2lFlow, summarizeFlowHistory } from "./f2lFlow";
import { runLastSlotOracle, lastLayerOutcome, summarizeOracleHistory } from "./lastSlotOracle";
import { buildMicroscope, canonicalAlg, extractAlgExecutions, mergeTurns } from "./algMicroscope";
import { analyzeNeutralitySolve, buildNeutralityReport, crossLengthsByColor } from "./neutrality";

const SCRAMBLES = [
  "D2 F' U2 L2 F U2 R2 B' L2 F' R' D B U R2 B L' U' F2 R",
  "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
  "F U2 L2 B2 U' R2 D L2 D' F2 R' B' L D' R U2 F R2 B' D",
];

/** Viewer (grip) notation → the physical, engine-frame turns a smart cube would report. */
function toEngine(seq: string, grip = YELLOW_TOP_GRIPS[0]): string[] {
  return seq.split(" ").map((t) => physicalFaceAt(grip, t[0]) + t.slice(1));
}

/** Evenly timed moves, with optional extra pause before given indices. */
function timed(moves: string[], gap = 120, pauses: Record<number, number> = {}): number[] {
  let t = 0;
  return moves.map((_, i) => {
    if (i > 0) t += gap + (pauses[i] ?? 0);
    return t;
  });
}

/** Cross (optimal) + F2L (solver, cheapest pair first) for a scramble — a realistic F2L stage. */
function crossAndF2l(scramble: string): string[] {
  const cross = solveCrossOptimal(scramble);
  const cube = new Cube();
  cube.move(scramble);
  if (cross.length) cube.move(cross.join(" "));
  return [...cross, ...solveF2L(cube).flatMap((p) => p.moves)];
}

describe("grips", () => {
  it("slotGrip reads each slot's insertion the standard way", () => {
    for (let slot = 0; slot < 4; slot++) {
      const grip = slotGrip(slot);
      const engine = toEngine("U R U' R'", grip);
      // Undoing the insertion from solved takes exactly this slot's pair out and nothing else.
      const cube = new Cube();
      cube.move(invertMoves(engine).join(" "));
      const solved = [0, 1, 2, 3].map((p) => f2lPairSolved(cube, p as 0 | 1 | 2 | 3));
      expect(solved.filter((s) => !s)).toHaveLength(1);
      expect(solved[slot]).toBe(false);
      expect(inGrip(engine, grip).join(" ")).toBe("U R U' R'");
    }
  });

  it("the four yellow-top grips are distinct y-rotations", () => {
    const reads = YELLOW_TOP_GRIPS.map((g) => viewerMove("F", g));
    expect(new Set(reads).size).toBe(4);
    expect(YELLOW_TOP_GRIPS.every((g) => viewerMove("D", g) === "U")).toBe(true);
  });
});

describe("F2L Flow", () => {
  it("tracks four distances down to zero and sees a greedy solver always pick the easiest pair", () => {
    const moves = crossAndF2l(SCRAMBLES[0]);
    const report = analyzeF2lFlow({ scramble: SCRAMBLES[0], moves, timesMs: timed(moves) })!;
    expect(report).not.toBeNull();
    expect(report.points[report.points.length - 1].distances).toEqual([0, 0, 0, 0]);
    expect(report.decisions.length + report.freePairs.length).toBe(4);
    expect(report.decisions.every((d) => d.regret === 0)).toBe(true);
    expect(report.easiestPickRate).toBe(1);
  });

  it("flags choosing the hardest pair first", () => {
    const scramble = SCRAMBLES[1];
    const cross = solveCrossOptimal(scramble);
    const cube = new Cube();
    cube.move(scramble);
    cube.move(cross.join(" "));
    // Deliberately worst-first order.
    const order = [...F2L_PAIRS].sort((a, b) => pairHeuristic(cube, b) - pairHeuristic(cube, a));
    const prior: PairId[] = [];
    const pairMoves: string[] = [];
    for (const pair of order) {
      const m = solvePairFromCube(cube, pair, prior)!;
      if (m.length) cube.move(m.join(" "));
      pairMoves.push(...m);
      prior.push(pair);
    }
    const moves = [...cross, ...pairMoves];
    const report = analyzeF2lFlow({ scramble, moves, timesMs: timed(moves) })!;
    expect(report.decisions[0].regret).toBeGreaterThan(0);
    expect(report.decisions[0].easiestDistance).toBeLessThan(report.decisions[0].chosenDistance);
    expect(report.easiestPickRate).toBeLessThan(1);
    const history = summarizeFlowHistory([report])!;
    expect(history.avgRegret).toBeGreaterThan(0);
  });

  it("returns null when F2L never finishes", () => {
    expect(analyzeF2lFlow({ scramble: SCRAMBLES[0], moves: ["R"], timesMs: [0] })).toBeNull();
  });
});

describe("Last Slot Oracle", () => {
  it("finds valid alternative insertions for the real last slot, including yours or better", () => {
    for (const scramble of SCRAMBLES) {
      const moves = crossAndF2l(scramble);
      const report = runLastSlotOracle({ scramble, moves, timesMs: timed(moves) }, { extraDepth: 1 })!;
      expect(report).not.toBeNull();
      expect(report.partial).toBe(false);
      expect(report.options.length).toBeGreaterThan(0);
      expect(Math.min(...report.options.map((o) => o.moves.length))).toBe(report.shortestInsertion);
      // Every option really finishes F2L from the start position, with the outcome it claims.
      const start = new Cube();
      start.move(scramble);
      start.move(moves.slice(0, report.startIndex + 1).join(" "));
      for (const option of report.options) {
        const c = start.clone();
        c.move(option.moves.join(" "));
        expect(bottomLayerSolved(c)).toBe(true);
        expect(lastLayerOutcome(c)).toEqual(option.outcome);
        expect(option.display.split(" ")).toHaveLength(option.moves.length);
        // Every suggestion stays within <R, U, F> for its slot.
        expect(new Set(option.display.split(" ").map((t) => t[0])).size).toBeLessThanOrEqual(3);
        expect(option.display.split(" ").every((t) => "RUF".includes(t[0]))).toBe(true);
      }
      // Options are sorted best first, and "better" is only set when it truly beats yours.
      const costs = report.options.map((o) => o.cost);
      expect(costs).toEqual([...costs].sort((a, b) => a - b));
      if (report.better) expect(report.better.cost).toBeLessThan(report.yours.cost);
      else expect(report.options[0].cost).toBeGreaterThanOrEqual(report.yours.cost);
    }
  });

  it("recognizes an OLL skip outcome", () => {
    const solved = new Cube();
    expect(lastLayerOutcome(solved).kind).toBe("ll-skip");
    const pllOnly = new Cube();
    pllOnly.move(toEngine("R U R' U' R' F R2 U' R' U' R U R' F'").join(" "));
    expect(lastLayerOutcome(pllOnly).kind).toBe("oll-skip");
  });

  it("summarizes skip availability across solves", () => {
    const reports = SCRAMBLES.map((scramble) => {
      const moves = crossAndF2l(scramble);
      return runLastSlotOracle({ scramble, moves, timesMs: timed(moves) }, { extraDepth: 0 })!;
    });
    const h = summarizeOracleHistory(reports)!;
    expect(h.solves).toBe(3);
    expect(h.avgTurnsSaved).toBeGreaterThanOrEqual(0);
  });
});

describe("Alg Microscope", () => {
  const INSERT = "U R U' R'";
  const SUNE = "R U R' U R U2 R'";
  const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

  function lastLayerSolve(grip: (typeof YELLOW_TOP_GRIPS)[number], stallAt?: number) {
    const moves = [...toEngine(INSERT, slotGrip(0)), ...toEngine(`U ${SUNE}`, grip), ...toEngine(`${T_PERM} U2`, grip)];
    const scramble = invertMoves(moves).join(" ");
    // Recognition pauses at step starts, plus an optional stall inside the T-perm.
    const pauses: Record<number, number> = { 4: 600, 12: 500 };
    if (stallAt !== undefined) pauses[12 + stallAt] = 400;
    return { scramble, moves, timesMs: timed(moves, 100, pauses) };
  }

  it("extracts the executed OLL and PLL algorithms in standard notation, AUFs stripped", () => {
    const execs = extractAlgExecutions(lastLayerSolve(YELLOW_TOP_GRIPS[0]));
    expect(execs.map((e) => [e.step, e.caseName, e.alg])).toEqual([
      ["OLL", "Sune", SUNE],
      ["PLL", "T Perm", T_PERM],
    ]);
    // OLL recognition covers the pause plus the pre-AUF turn.
    expect(execs[0].recognitionMs).toBe(700 + 100);
    expect(execs[1].executionMs).toBe(13 * 100);
  });

  it("reads the same algorithm the same way from any side", () => {
    for (const grip of YELLOW_TOP_GRIPS) {
      const execs = extractAlgExecutions(lastLayerSolve(grip));
      expect(execs.map((e) => e.alg)).toEqual([SUNE, T_PERM]);
    }
    expect(canonicalAlg(toEngine(SUNE, YELLOW_TOP_GRIPS[3])).join(" ")).toBe(SUNE);
  });

  /** A solve whose last layer is exactly `ll` (grip notation, yellow top), after one F2L insert. */
  function llSolve(ll: string, pauses: Record<number, number> = {}) {
    const moves = [...toEngine(INSERT, slotGrip(0)), ...toEngine(ll)];
    return { scramble: invertMoves(moves).join(" "), moves, timesMs: timed(moves, 100, { 4: 600, ...pauses }) };
  }
  const EDGES = "F R U R' U' F'";
  const UA = "R U' R U R U R U' R' U' R2";
  const AA = "R' F R' B2 R F' R' B2 R2";

  it("knows one look from two", () => {
    const one = extractAlgExecutions(lastLayerSolve(YELLOW_TOP_GRIPS[0]));
    expect(one.map((e) => [e.oneLook, e.clean])).toEqual([
      [true, true],
      [true, true],
    ]);
    // Two-look OLL: edges, an AUF, then Sune.
    const twoOll = extractAlgExecutions(llSolve(`${EDGES} U ${SUNE} ${T_PERM} U2`));
    expect(twoOll[0]).toMatchObject({ step: "OLL", oneLook: false });
    // Same two algorithms with no AUF between them: a stop gives the second look away...
    const paused = extractAlgExecutions(llSolve(`${EDGES} ${SUNE} ${T_PERM} U2`, { 10: 700 }));
    expect(paused[0].oneLook).toBe(false);
    // ...but flowing straight through reads as one algorithm.
    const flowing = extractAlgExecutions(llSolve(`${EDGES} ${SUNE} ${T_PERM} U2`));
    expect(flowing[0].oneLook).toBe(true);
    // Two-look PLL: corners (an A-perm), a stop, then edges (a U-perm).
    const twoPll = extractAlgExecutions(llSolve(`${SUNE} ${AA} ${UA}`, { 20: 700 }));
    expect(twoPll.find((e) => e.step === "PLL")).toMatchObject({ oneLook: false });
    // With an AUF between them it runs past the length any one algorithm has, and isn't read as one at all.
    expect(extractAlgExecutions(llSolve(`${SUNE} U ${T_PERM} U ${UA}`)).find((e) => e.step === "PLL")).toBeUndefined();
  });

  it("writes quarter turns the way you'd write the algorithm, and spots a fumble", () => {
    expect(mergeTurns(["R", "R", "U", "U'", "F", "F", "F"])).toEqual({ tokens: ["R2", "F'"], cancelled: true });
    const quarter = T_PERM.replace("R2", "R R");
    const [, pll] = extractAlgExecutions(llSolve(`U ${SUNE} ${quarter} U2`));
    expect(pll.alg).not.toBe(T_PERM);
    expect(pll.mergedAlg).toBe(T_PERM);
    expect(pll.clean).toBe(true);
    // Written the way a person would: "F R U' R' …", not "R B U' B' …".
    const back = "F R U' R' U R U R2 F' R U R U' R'";
    const [, alt] = extractAlgExecutions(llSolve(`U ${SUNE} ${back} U2`));
    expect(alt.mergedAlg).toBe(back);
    expect(alt.alg).not.toBe(back);
  });

  it("pinpoints the turn your hands stall on", () => {
    const execs = [0, 1, 2].flatMap((k) => extractAlgExecutions({ ...lastLayerSolve(YELLOW_TOP_GRIPS[k], 6), date: k }));
    const cases = buildMicroscope(execs);
    const t = cases.find((c) => c.caseName === "T Perm")!;
    expect(t.count).toBe(3);
    expect(t.variants).toHaveLength(1);
    expect(t.variants[0].stall).toMatchObject({ index: 6, token: "R2" });
    const sune = cases.find((c) => c.caseName === "Sune")!;
    expect(sune.variants[0].stall).toBeNull();
  });
});

describe("Color Neutrality Scout", () => {
  it("measures each color's shortest cross", () => {
    expect(crossLengthsByColor("")).toEqual({ U: 0, D: 0, F: 0, B: 0, R: 0, L: 0 });
    expect(crossLengthsByColor("R")).toEqual({ U: 1, D: 1, F: 1, B: 1, R: 1, L: 0 });
    for (const s of SCRAMBLES) {
      const lengths = crossLengthsByColor(s);
      expect(lengths.U).toBe(solveCrossOptimal(s).length);
      // Yellow's cross: solve white's cross on the cube viewed yellow-up.
      const yellowGrip = colorOnTopGrip("D");
      const relabelled = s.split(" ").map((t) => viewerMove(t, yellowGrip)).join(" ");
      expect(lengths.D).toBe(solveCrossOptimal(relabelled).length);
    }
  });

  it("prices neutrality in seconds at your own cross pace", () => {
    const solves = SCRAMBLES.map((scramble, i) => {
      // An optimal white cross at 250ms a turn.
      const cross = solveCrossOptimal(scramble);
      return analyzeNeutralitySolve({ scramble, moves: cross, timesMs: timed(cross, 250), date: i })!;
    });
    const report = buildNeutralityReport(solves)!;
    expect(report.solves).toBe(3);
    expect(report.efficiency).toBeCloseTo(1, 5);
    const full = report.options.find((o) => o.label === "Full neutral")!;
    const dual = report.options.find((o) => o.label.startsWith("Dual"))!;
    expect(full.turnsSaved).toBeGreaterThanOrEqual(dual.turnsSaved);
    expect(dual.turnsSaved).toBeGreaterThanOrEqual(0);
    expect(full.msSaved).toBeCloseTo(full.turnsSaved * report.msPerTurn, 5);
    expect(report.bestSecondColor).not.toBeNull();
  });
});
