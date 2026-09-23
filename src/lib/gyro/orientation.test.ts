import { describe, expect, it } from "vitest";
import {
  CUBE_ORIENTATIONS,
  DEFAULT_CALIBRATION,
  HOME_ORIENTATION,
  IDENTITY,
  angleBetween,
  apply,
  axisRotation,
  detectRotations,
  matToQuat,
  mul,
  nameRotation,
  orientationFromQuat,
  orientationLabel,
  orientedReconstruction,
  quatToMat,
  sequenceMatrix,
  snapOrientation,
  solveCalibration,
  tokenMatrix,
  transpose,
  viewerMove,
  type GyroCalibration,
  type GyroSample,
  type Mat3,
  type Quat,
} from "./orientation";
import { newCube } from "@/lib/cube-engine/engine";

/** Deterministic PRNG so the "random" world alignments and wobble are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomRotation(rand: () => number): Mat3 {
  return mul(mul(axisRotation("x", rand() * 360), axisRotation("y", rand() * 360)), axisRotation("z", rand() * 360));
}

function conj(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/**
 * Plays the physical world forwards: what raw quaternion a cube with IMU
 * mounting `truth` would report when held in viewer orientation `a`, given
 * its sensor read `refRaw` in the HOME grip.
 */
function rawFor(a: Mat3, refRaw: Mat3, truth: GyroCalibration): Quat {
  const deltaBody = mul(transpose(HOME_ORIENTATION), a);
  const deltaSensor = mul(mul(transpose(truth.map), deltaBody), truth.map);
  const q = matToQuat(mul(refRaw, deltaSensor));
  return truth.conjugate ? conj(q) : q;
}

function refQuat(refRaw: Mat3, truth: GyroCalibration): Quat {
  const q = matToQuat(refRaw);
  return truth.conjugate ? conj(q) : q;
}

function stream(
  poses: { untilMs: number; a: Mat3 }[],
  refRaw: Mat3,
  truth: GyroCalibration,
  opts: { stepMs?: number; wobbleDeg?: number; seed?: number } = {},
): GyroSample[] {
  const step = opts.stepMs ?? 20;
  const rand = rng(opts.seed ?? 1);
  const out: GyroSample[] = [];
  let t = 0;
  for (const pose of poses) {
    for (; t < pose.untilMs; t += step) {
      const w = opts.wobbleDeg ?? 0;
      const wobble = mul(axisRotation("x", (rand() - 0.5) * 2 * w), axisRotation("z", (rand() - 0.5) * 2 * w));
      out.push({ atMs: t, q: rawFor(mul(wobble, pose.a), refRaw, truth) });
    }
  }
  return out;
}

const matEq = (a: Mat3, b: Mat3) => angleBetween(a, b) < 1e-6;

describe("orientation group", () => {
  it("enumerates exactly the 24 cube orientations", () => {
    expect(CUBE_ORIENTATIONS).toHaveLength(24);
  });

  it("rotation tokens turn the cube like their namesake face turns", () => {
    // x like R: front comes up. y like U: front goes left. z like F: top goes right.
    expect(apply(tokenMatrix("x"), [0, 0, 1]).map(Math.round)).toEqual([0, 1, 0]);
    expect(apply(tokenMatrix("y"), [0, 0, 1]).map(Math.round)).toEqual([-1, 0, 0]);
    expect(apply(tokenMatrix("z"), [0, 1, 0]).map(Math.round)).toEqual([1, 0, 0]);
  });

  it("names every orientation with a spelling that composes back to it", () => {
    for (const o of CUBE_ORIENTATIONS) {
      const name = nameRotation(o);
      expect(name).not.toBe("?");
      expect(name.split(" ").filter(Boolean).length).toBeLessThanOrEqual(2);
      expect(matEq(sequenceMatrix(name), o)).toBe(true);
    }
  });

  it("the HOME grip is yellow top, green front", () => {
    expect(orientationLabel(HOME_ORIENTATION)).toBe("yellow top · green front");
    expect(orientationLabel(IDENTITY)).toBe("white top · green front");
  });

  it("re-labels physical turns into the solver's frame", () => {
    // Held yellow-up: the white face is at the bottom, red on the left.
    expect(viewerMove("U", HOME_ORIENTATION)).toBe("D");
    expect(viewerMove("R'", HOME_ORIENTATION)).toBe("L'");
    expect(viewerMove("F2", HOME_ORIENTATION)).toBe("F2");
    // After a y from home, the (blue) back face is now on the right.
    const afterY = mul(tokenMatrix("y"), HOME_ORIENTATION);
    expect(viewerMove("B", afterY)).toBe("R");
    // …and the orange face, which sat on the right in the yellow-up grip, has come round to the front.
    expect(viewerMove("L", afterY)).toBe("F");
  });
});

describe("quaternion round-trip", () => {
  it("matToQuat inverts quatToMat", () => {
    const rand = rng(7);
    for (let i = 0; i < 20; i++) {
      const m = randomRotation(rand);
      expect(angleBetween(quatToMat(matToQuat(m)), m)).toBeLessThan(1e-4);
    }
  });
});

describe("orientationFromQuat", () => {
  it("reads HOME at the reference pose and tracks a y from there", () => {
    const refRaw = randomRotation(rng(3));
    const ref = refQuat(refRaw, DEFAULT_CALIBRATION);
    expect(angleBetween(orientationFromQuat(ref, ref, DEFAULT_CALIBRATION), HOME_ORIENTATION)).toBeLessThan(1e-4);
    const afterY = mul(tokenMatrix("y"), HOME_ORIENTATION);
    const q = rawFor(afterY, refRaw, DEFAULT_CALIBRATION);
    expect(angleBetween(orientationFromQuat(q, ref, DEFAULT_CALIBRATION), afterY)).toBeLessThan(1e-4);
  });
});

describe("solveCalibration", () => {
  it("recovers any square sensor mounting and either quaternion convention from home → y → y x", () => {
    const rand = rng(11);
    for (let trial = 0; trial < 12; trial++) {
      const truth: GyroCalibration = {
        map: [...CUBE_ORIENTATIONS[Math.floor(rand() * 24)]],
        conjugate: rand() < 0.5,
      };
      const refRaw = randomRotation(rand);
      const home = refQuat(refRaw, truth);
      const afterY = rawFor(mul(tokenMatrix("y"), HOME_ORIENTATION), refRaw, truth);
      const afterYX = rawFor(mul(sequenceMatrix("y x"), HOME_ORIENTATION), refRaw, truth);
      const result = solveCalibration(home, afterY, afterYX);
      expect(result).not.toBeNull();
      // Whatever it picked must behave identically to the truth on an unseen pose.
      const probe = mul(sequenceMatrix("z' x2"), HOME_ORIENTATION);
      const q = rawFor(probe, refRaw, truth);
      expect(angleBetween(orientationFromQuat(q, home, result!.calibration), probe)).toBeLessThan(1);
    }
  });

  it("tolerates a sloppy 10° hold", () => {
    const truth = DEFAULT_CALIBRATION;
    const refRaw = randomRotation(rng(5));
    const sloppy = axisRotation("x", 10);
    const home = refQuat(refRaw, truth);
    const afterY = rawFor(mul(sloppy, mul(tokenMatrix("y"), HOME_ORIENTATION)), refRaw, truth);
    const afterYX = rawFor(mul(sequenceMatrix("y x"), HOME_ORIENTATION), refRaw, truth);
    const result = solveCalibration(home, afterY, afterYX);
    expect(result?.calibration.map).toEqual(truth.map);
    expect(result?.calibration.conjugate).toBe(false);
  });

  it("refuses when the wrong rotations were done", () => {
    const truth = DEFAULT_CALIBRATION;
    const refRaw = randomRotation(rng(9));
    const home = refQuat(refRaw, truth);
    // Did nothing at all for either step.
    expect(solveCalibration(home, home, home)).toBeNull();
  });
});

describe("detectRotations", () => {
  const truth = DEFAULT_CALIBRATION;
  const refRaw = randomRotation(rng(21));
  const ref = refQuat(refRaw, truth);
  const home = HOME_ORIENTATION;
  const after = (seq: string) => mul(sequenceMatrix(seq), home);

  it("finds nothing while the cube just wobbles in the hand", () => {
    const samples = stream([{ untilMs: 5000, a: home }], refRaw, truth, { wobbleDeg: 18, seed: 4 });
    const { rotations, segments } = detectRotations(samples, ref, truth);
    expect(rotations).toEqual([]);
    expect(segments).toHaveLength(1);
  });

  it("detects a y and an x' in order, timed at when each regrip began", () => {
    const samples = stream(
      [
        { untilMs: 1000, a: home },
        { untilMs: 1060, a: mul(axisRotation("y", -45), home) },
        { untilMs: 2000, a: after("y") },
        { untilMs: 2060, a: mul(axisRotation("x", 45), after("y")) },
        { untilMs: 3000, a: after("y x'") },
      ],
      refRaw,
      truth,
      { wobbleDeg: 6 },
    );
    const { rotations } = detectRotations(samples, ref, truth);
    expect(rotations.map((r) => r.token)).toEqual(["y", "x'"]);
    expect(rotations[0].atMs).toBeGreaterThanOrEqual(960);
    expect(rotations[0].atMs).toBeLessThanOrEqual(1000);
  });

  it("reads a quick y2 as one y2, not y y", () => {
    const samples = stream(
      [
        { untilMs: 1000, a: home },
        { untilMs: 1040, a: mul(axisRotation("y", -60), home) },
        { untilMs: 1100, a: after("y") }, // passes through y for only 60ms
        { untilMs: 1140, a: mul(axisRotation("y", -150), home) },
        { untilMs: 2000, a: after("y2") },
      ],
      refRaw,
      truth,
    );
    expect(detectRotations(samples, ref, truth).rotations.map((r) => r.token)).toEqual(["y2"]);
  });

  it("works with a sparse (~10Hz) stream", () => {
    const samples = stream(
      [
        { untilMs: 1000, a: home },
        { untilMs: 2500, a: after("z") },
      ],
      refRaw,
      truth,
      { stepMs: 100 },
    );
    expect(detectRotations(samples, ref, truth).rotations.map((r) => r.token)).toEqual(["z"]);
  });

  it("ignores poses stuck between two orientations", () => {
    const samples = stream(
      [
        { untilMs: 1000, a: home },
        { untilMs: 3000, a: mul(axisRotation("y", -45), home) },
      ],
      refRaw,
      truth,
    );
    expect(detectRotations(samples, ref, truth).rotations).toEqual([]);
  });
});

describe("snapOrientation", () => {
  it("snaps a 20°-off pose to its nearest orientation", () => {
    const o = CUBE_ORIENTATIONS[7];
    const { index, errorDeg } = snapOrientation(mul(axisRotation("z", 20), o));
    expect(index).toBe(7);
    expect(errorDeg).toBeCloseTo(20, 3);
  });
});

describe("orientedReconstruction", () => {
  it("rewrites physical moves into the solver's frame with regrips inserted, and stays equivalent", () => {
    const scramble = "R U F' L2 D B' R2 U'";
    const home = HOME_ORIENTATION;
    const afterY = mul(tokenMatrix("y"), home);
    const segments = [
      { fromMs: 0, orientation: home },
      { fromMs: 1500, orientation: afterY },
    ];
    const rotations = [{ atMs: 1450, token: "y" }];
    const physical = ["U", "R'", "F", "B", "L2"];
    const times = [200, 600, 1000, 1700, 2100];
    const { tokens, inspection } = orientedReconstruction(physical, times, segments, rotations, 100);
    expect(inspection).toBe("z2");
    // Yellow-up: white U → D, red R → L, green F → F. After the y, blue (back) faces right and orange faces front.
    expect(tokens).toEqual(["z2", "D", "L'", "F", "y", "R", "F2"]);

    // Equivalence: scramble + physical moves must leave the same physical
    // cube as scramble + the oriented version, once the net rotation is undone.
    const physicalCube = newCube();
    physicalCube.move(scramble);
    physicalCube.move(physical.join(" "));

    const viewerCube = newCube();
    viewerCube.move(scramble);
    viewerCube.move(tokens.join(" "));
    const net = sequenceMatrix(tokens.filter((t) => /^[xyz]/.test(t)).join(" "));
    viewerCube.move(nameRotation(transpose(net).map(Math.round)));

    expect(viewerCube.asString()).toBe(physicalCube.asString());
  });
});
