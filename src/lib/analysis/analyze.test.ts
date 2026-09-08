import { beforeAll, describe, expect, it } from "vitest";
import { ensureSolverReady } from "../cube-engine/engine";
import { solveCFOP } from "../solvers/cfop";
import { analyzeSolve, type SolveAnalysis } from "./analyze";
import { FACES, mapFromSolverFrame, relabelAlg, type Face } from "./frames";

// A scramble whose CFOP solution comes out cleanly staged, so the fixtures
// below describe a real solve rather than a solver fallback.
const SCRAMBLE = "D2 R' U2 R2 B2 L2 F2 D' L2 D2 R2 U' B' L D' B2 R' U L' F2";

/**
 * Builds a reconstruction the way a cuber would have written it: our own CFOP
 * solution, relabeled into the orientation they held the cube in.
 */
function solveAsWrittenBy(face: Face) {
  const model = solveCFOP(SCRAMBLE);
  const map = mapFromSolverFrame(face);
  return {
    scramble: relabelAlg(SCRAMBLE, map),
    reconstruction: relabelAlg(model.full.join(" "), map),
    model,
  };
}

function expectOk(result: ReturnType<typeof analyzeSolve>): SolveAnalysis {
  if (!result.ok) throw new Error(`analysis failed: ${result.errors.join("; ")}`);
  return result;
}

describe("solve analyzer", () => {
  beforeAll(() => {
    ensureSolverReady();
  });

  it("splits a CFOP solve into its phases and accounts for every move", () => {
    const { scramble, reconstruction, model } = solveAsWrittenBy("D");
    const analysis = expectOk(analyzeSolve({ scramble, reconstruction }));

    expect(analysis.crossFace).toBe("D");
    expect(analysis.cfopShaped).toBe(true);
    expect(analysis.phases.map((p) => p.phase)).toEqual([
      "cross",
      "f2l",
      "f2l",
      "f2l",
      "f2l",
      "oll",
      "pll",
    ]);

    // No move is dropped or double-counted between the phases.
    const phaseTotal = analysis.phases.reduce((sum, p) => sum + p.moves.length, 0);
    expect(phaseTotal).toBe(analysis.moves.length);
    expect(analysis.moves.length).toBe(model.full.length);

    // Phase boundaries land where the solver actually staged them.
    expect(analysis.phases[0].moves.length).toBe(model.cross.length);
  }, 180_000);

  it("finds the cross whichever face it was built on", () => {
    for (const face of FACES) {
      const { scramble, reconstruction } = solveAsWrittenBy(face);
      const analysis = expectOk(analyzeSolve({ scramble, reconstruction }));
      expect(analysis.crossFace, `cross written on ${face}`).toBe(face);
    }
  }, 300_000);

  it("is unmoved by cube rotations inside the solve", () => {
    const { scramble, reconstruction } = solveAsWrittenBy("D");
    const plain = expectOk(analyzeSolve({ scramble, reconstruction }));

    // A rotation and its inverse change nothing about the solve, so they must
    // change nothing about the analysis either — except the rotation count.
    const moves = reconstruction.split(" ");
    const withRotations = [...moves.slice(0, 6), "y", "y'", ...moves.slice(6)].join(" ");
    const rotated = expectOk(analyzeSolve({ scramble, reconstruction: withRotations }));

    expect(rotated.crossFace).toBe(plain.crossFace);
    expect(rotated.metrics.stm).toBe(plain.metrics.stm);
    expect(rotated.metrics.rotations).toBe(2);
    expect(rotated.phases.map((p) => p.metrics.stm)).toEqual(plain.phases.map((p) => p.metrics.stm));
  }, 240_000);

  it("compares the cross against the provably shortest one", () => {
    const { scramble, reconstruction } = solveAsWrittenBy("D");
    // Waste four moves at the very start; the cross model should be unchanged
    // and the loss should be exactly what was wasted.
    const wasteful = `R U U' R' ${reconstruction}`;
    const clean = expectOk(analyzeSolve({ scramble, reconstruction }));
    const messy = expectOk(analyzeSolve({ scramble, reconstruction: wasteful }));

    expect(messy.phases[0].model?.metrics.stm).toBe(clean.phases[0].model?.metrics.stm);
    expect(messy.phases[0].lost).toBe(4);
    expect(messy.findings.some((f) => f.id === "cross-long")).toBe(true);
    expect(messy.findings.some((f) => f.id === "cancellations")).toBe(true);
  }, 240_000);

  it("names the last-layer cases it saw", () => {
    const { scramble, reconstruction } = solveAsWrittenBy("D");
    const analysis = expectOk(analyzeSolve({ scramble, reconstruction }));
    const oll = analysis.phases.find((p) => p.phase === "oll")!;
    const pll = analysis.phases.find((p) => p.phase === "pll")!;

    // Either a named case or an explicit skip — never an unexplained blank.
    for (const phase of [oll, pll]) {
      expect(phase.caseName, `${phase.phase} case`).toBeTruthy();
      if (!phase.skipped) expect(phase.caseAlg).toBeTruthy();
    }
  }, 180_000);

  it("reports turn speed when given a time", () => {
    const { scramble, reconstruction } = solveAsWrittenBy("D");
    const analysis = expectOk(analyzeSolve({ scramble, reconstruction, timeMs: 12_000 }));
    expect(analysis.tps).toBeCloseTo(analysis.metrics.etm / 12, 5);
  }, 180_000);

  it("refuses a reconstruction that doesn't solve the scramble", () => {
    const { scramble, reconstruction } = solveAsWrittenBy("D");
    const broken = reconstruction.split(" ").slice(0, -3).join(" ");
    const result = analyzeSolve({ scramble, reconstruction: broken });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("don't solve that scramble");
  }, 180_000);

  it("explains bad notation instead of guessing", () => {
    const result = analyzeSolve({ scramble: "R U", reconstruction: "R U Q2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("Reconstruction");
  });
});
