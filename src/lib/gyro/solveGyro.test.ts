import { describe, expect, it } from "vitest";
import { rotationsPerPhase, summarizeSolveGyro } from "./solveGyro";
import { DEFAULT_CALIBRATION, HOME_ORIENTATION, angleBetween, matToQuat, mul, quatToMat, sequenceMatrix, transpose, type Mat3, type Quat } from "./orientation";

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

    // The continuous stream: scoped to the solve window (> startedAtMs, <= the last move),
    // thinned to no denser than 50ms apart, and correctly baked into body-frame quaternions —
    // the first sample (right after the regrip window's already-home stretch) still reads as
    // home, the last (deep into the afterY stretch) reads as the rotated grip.
    const stream = summary.stream!;
    expect(stream.atMs.length).toBeGreaterThan(5);
    expect(stream.atMs[0]).toBeGreaterThan(0);
    expect(stream.atMs[stream.atMs.length - 1]).toBeLessThanOrEqual(1000); // moves end at 2500, i.e. 1000ms after start
    for (let i = 1; i < stream.atMs.length; i++) expect(stream.atMs[i] - stream.atMs[i - 1]).toBeGreaterThanOrEqual(50);
    const bakedAt = (i: number): Quat => ({ x: stream.qx[i], y: stream.qy[i], z: stream.qz[i], w: stream.qw[i] });
    expect(angleBetween(quatToMat(bakedAt(0)), home)).toBeLessThan(1);
    expect(angleBetween(quatToMat(bakedAt(stream.atMs.length - 1)), afterY)).toBeLessThan(1);
  });

  it("thins a dense stream to no closer than 50ms apart", () => {
    const refRaw: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const m = DEFAULT_CALIBRATION.map;
    const rawFor = (a: Mat3) => matToQuat(mul(refRaw, mul(mul(transpose(m), mul(transpose(HOME_ORIENTATION), a)), m)));
    const ref = matToQuat(refRaw);
    // 100 samples, 10ms apart (100Hz) — much denser than the 50ms floor.
    const samples = Array.from({ length: 100 }, (_, i) => ({ atMs: i * 10, q: rawFor(HOME_ORIENTATION) }));
    const moves = [{ token: "U", timeStampMs: 990 }];
    const summary = summarizeSolveGyro(samples, ref, DEFAULT_CALIBRATION, moves, 0)!;
    const stream = summary.stream!;
    expect(stream.atMs.length).toBeLessThan(25); // 990ms / 50ms floor, generously
    for (let i = 1; i < stream.atMs.length; i++) expect(stream.atMs[i] - stream.atMs[i - 1]).toBeGreaterThanOrEqual(50);
  });

  it("has no stream when every sample falls outside the solve window", () => {
    const refRaw: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const ref = matToQuat(refRaw);
    const samples = [{ atMs: 100, q: matToQuat(refRaw) }]; // before startedAtMs
    const moves = [{ token: "U", timeStampMs: 1500 }];
    const summary = summarizeSolveGyro(samples, ref, DEFAULT_CALIBRATION, moves, 1000)!;
    expect(summary.stream).toBeNull();
  });
});
