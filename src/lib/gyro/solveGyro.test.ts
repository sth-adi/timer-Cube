import { describe, expect, it } from "vitest";
import { rotationsPerPhase, summarizeSolveGyro } from "./solveGyro";
import { DEFAULT_CALIBRATION, HOME_ORIENTATION, matToQuat, mul, sequenceMatrix, transpose, type Mat3 } from "./orientation";

describe("rotationsPerPhase", () => {
  it("counts each regrip against the phase it happened during", () => {
    // Cross ends 1500, F2L pairs at 3000/4500, OLL 6000, PLL 8000.
    const ends = [1500, 3000, 4500, 6000, 8000];
    const rotations = [{ atMs: 200 }, { atMs: 1600 }, { atMs: 2900 }, { atMs: 5000 }, { atMs: 9000 }];
    expect(rotationsPerPhase(rotations, ends)).toEqual([1, 2, 0, 1, 1]);
  });

  it("skips phases whose end isn't known", () => {
    expect(rotationsPerPhase([{ atMs: 100 }], [null, 500])).toEqual([0, 1]);
  });
});

describe("summarizeSolveGyro", () => {
  it("needs a reference pose and samples", () => {
    expect(summarizeSolveGyro([], null, DEFAULT_CALIBRATION, [{ token: "R", timeStampMs: 0 }], 0)).toBeNull();
  });

  it("produces the oriented reconstruction and regrips relative to solve start", () => {
    // Identity sensor frame: raw quaternion = the body delta the default map expects.
    const refRaw: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const m = DEFAULT_CALIBRATION.map;
    const rawFor = (a: Mat3) => matToQuat(mul(refRaw, mul(mul(transpose(m), mul(transpose(HOME_ORIENTATION), a)), m)));
    const ref = matToQuat(refRaw);
    const home = HOME_ORIENTATION;
    const afterY = mul(sequenceMatrix("y"), home);
    const samples = [
      ...Array.from({ length: 50 }, (_, i) => ({ atMs: 1000 + i * 20, q: rawFor(home) })),
      ...Array.from({ length: 50 }, (_, i) => ({ atMs: 2000 + i * 20, q: rawFor(afterY) })),
    ];
    const moves = [
      { token: "U", timeStampMs: 1500 },
      { token: "B", timeStampMs: 2500 },
    ];
    const summary = summarizeSolveGyro(samples, ref, DEFAULT_CALIBRATION, moves, 1500)!;
    expect(summary.orientedReconstruction).toBe("z2 D y R");
    expect(summary.rotations).toEqual([{ atMs: 480, token: "y" }]);
    expect(summary.startLabel).toBe("yellow top · green front");
  });
});
