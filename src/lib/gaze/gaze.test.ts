import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { DEFAULT_CALIBRATION, HOME_ORIENTATION, matToQuat, mul, sequenceMatrix, transpose, type Mat3 } from "@/lib/gyro/orientation";
import { EDGE_SLOT_FACELETS, EDGE_SLOT_NAMES, analyzeGaze, crossEdgeLocations, faceVisibility } from "./gaze";

const m = DEFAULT_CALIBRATION.map;
const rawFor = (a: Mat3) => matToQuat(mul(mul(transpose(m), mul(transpose(HOME_ORIENTATION), a)), m));
const ref = matToQuat([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const hold = (a: Mat3, fromMs: number, toMs: number) =>
  Array.from({ length: Math.floor((toMs - fromMs) / 20) }, (_, i) => ({ atMs: fromMs + i * 20, q: rawFor(a) }));

const facelets = (alg: string) => {
  const c = new Cube();
  if (alg) c.move(alg);
  return c.asString();
};

describe("EDGE_SLOT_FACELETS", () => {
  it("reads each slot's piece colors correctly on a scrambled cube", () => {
    const c = new Cube();
    c.move("R U2 F' L D B2 R' D' L2 F U' B R2 D2");
    const s = c.asString();
    for (let slot = 0; slot < 12; slot++) {
      const piece = EDGE_SLOT_NAMES[c.ep[slot]];
      const [a, b] = EDGE_SLOT_FACELETS[slot];
      const read = c.eo[slot] === 0 ? s[a] + s[b] : s[b] + s[a];
      expect(read).toBe(piece);
    }
  });
});

describe("faceVisibility", () => {
  it("sees the front and top in the home grip, not the back or bottom", () => {
    const v = faceVisibility(HOME_ORIENTATION);
    expect(v.F).toBeGreaterThan(0.8); // green front
    expect(v.D).toBeGreaterThan(0.4); // yellow top
    expect(v.B).toBeLessThan(0);
    expect(v.U).toBeLessThan(0);
  });
});

describe("crossEdgeLocations", () => {
  it("finds the white edges", () => {
    const edges = crossEdgeLocations(facelets("U"));
    expect(edges.map((e) => e.name)).toEqual(["white-red", "white-green", "white-orange", "white-blue"]);
    expect(edges.every((e) => !e.solved)).toBe(true);
    expect(crossEdgeLocations(facelets("")).every((e) => e.solved)).toBe(true);
  });
});

describe("analyzeGaze", () => {
  it("flags cross edges on sides never turned toward you", () => {
    // Held in the home grip the whole time: green front, yellow top.
    const report = analyzeGaze(hold(HOME_ORIENTATION, 0, 5000), ref, DEFAULT_CALIBRATION, 0, 5000, facelets("U"))!;
    expect(report.seen.sort()).toEqual(["D", "F"]);
    // After U the edge in UF (green side) is visible; the other three hide on the white/side faces.
    expect(report.hidden).toHaveLength(3);
    expect(report.headline).toMatch(/3 cross edges/);
  });

  it("credits a side once you turn the cube to look at it", () => {
    const home = HOME_ORIENTATION;
    const samples = [...hold(home, 0, 1000), ...hold(mul(sequenceMatrix("y"), home), 1000, 2000), ...hold(mul(sequenceMatrix("y2"), home), 2000, 3000), ...hold(mul(sequenceMatrix("y'"), home), 3000, 4000), ...hold(mul(sequenceMatrix("x"), home), 4000, 5000)];
    const report = analyzeGaze(samples, ref, DEFAULT_CALIBRATION, 0, 5000, facelets("U"))!;
    expect(report.unseen).toHaveLength(0);
    expect(report.hidden).toHaveLength(0);
    expect(report.timeline.length).toBe(5);
    expect(report.timeline[0]).toMatchObject({ front: "F", top: "D" });
  });

  it("needs enough samples", () => {
    expect(analyzeGaze([], ref, DEFAULT_CALIBRATION, 0, 5000, facelets("U"))).toBeNull();
  });
});
