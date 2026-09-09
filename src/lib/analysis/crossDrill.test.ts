import { describe, expect, it } from "vitest";
import { Cube } from "../cube-engine/engine";
import { solveCrossOptimal } from "../solvers/cross";
import { gradeCrossAttempt } from "./crossDrill";
import { mapFromSolverFrame, relabelAlg } from "./frames";
import { crossSolvedOn } from "./segment";

const SCRAMBLE = "D2 R' U2 R2 B2 L2 F2 D' L2 D2 R2 U' B' L D' B2 R' U L' F2";

function ok(result: ReturnType<typeof gradeCrossAttempt>) {
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result;
}

describe("cross drill grading", () => {
  it("accepts the optimal cross written in the solver's own frame", () => {
    const optimal = solveCrossOptimal(SCRAMBLE).join(" ");
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: optimal, crossFace: "U" }));
    expect(result.solved).toBe(true);
    expect(result.optimal).toBe(true);
    expect(result.moveCount).toBe(result.optimalCount);
  });

  /**
   * The case that actually matters: almost every cuber holds white on the
   * bottom, so their moves are written in a frame rotated from the one the
   * scramble was applied in. The same cross, spelled differently, must grade
   * identically.
   */
  it("accepts the same cross written with the cross on D", () => {
    const asHeld = relabelAlg(solveCrossOptimal(SCRAMBLE).join(" "), mapFromSolverFrame("D"));
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: asHeld, crossFace: "D" }));
    expect(result.solved).toBe(true);
    expect(result.optimal).toBe(true);
  });

  it("hands back the shortest cross in the frame the cuber is holding", () => {
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: "", crossFace: "D" }));
    expect(result.optimalCount).toBeLessThanOrEqual(8);
    expect(result.optimalMoves).toHaveLength(result.optimalCount);

    // Executing what it handed back, in that frame, really does solve the cross.
    const check = ok(
      gradeCrossAttempt({ scramble: SCRAMBLE, attempt: result.optimalMoves.join(" "), crossFace: "D" }),
    );
    expect(check.solved).toBe(true);
    expect(check.optimal).toBe(true);
  });

  it("marks a cross that works but wanders as solved, not optimal", () => {
    const optimal = solveCrossOptimal(SCRAMBLE).join(" ");
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: `R R' ${optimal}`, crossFace: "U" }));
    expect(result.solved).toBe(true);
    expect(result.optimal).toBe(false);
    expect(result.moveCount).toBe(result.optimalCount + 2);
  });

  it("rejects an attempt that doesn't finish the cross", () => {
    const optimal = solveCrossOptimal(SCRAMBLE);
    const short = optimal.slice(0, -1).join(" ");
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: short, crossFace: "U" }));
    expect(result.solved).toBe(false);
    expect(result.optimal).toBe(false);
  });

  it("treats an empty attempt as unsolved rather than erroring", () => {
    const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt: "", crossFace: "D" }));
    expect(result.solved).toBe(false);
    expect(result.moveCount).toBe(0);
  });

  it("reports bad notation instead of guessing", () => {
    const result = gradeCrossAttempt({ scramble: SCRAMBLE, attempt: "R U Q", crossFace: "D" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('"Q"');
  });

  it("never claims a cross the cube engine disagrees with", () => {
    // Cross-check the verdict directly against the engine for a handful of
    // attempts, so a frame bug can't quietly agree with itself.
    for (const face of ["U", "D"] as const) {
      const attempt = relabelAlg(solveCrossOptimal(SCRAMBLE).join(" "), mapFromSolverFrame(face));
      const result = ok(gradeCrossAttempt({ scramble: SCRAMBLE, attempt, crossFace: face }));
      const cube = new Cube();
      cube.move(SCRAMBLE);
      cube.move(solveCrossOptimal(SCRAMBLE).join(" "));
      expect(result.solved).toBe(crossSolvedOn(cube, "U"));
    }
  });
});
