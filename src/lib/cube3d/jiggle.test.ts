import { describe, expect, it } from "vitest";
import { parseMove } from "@/lib/cube-engine/stickerTurns";
import { RATTLE_MS, TILT_MAX_DEG, WOBBLE_MAX_DEG, WOBBLE_MS, buildJiggleEvents, layerTilt, rattleAt, rattleOffset, turnKick, wobbleAngle, wobbleAt } from "./jiggle";

const DEG = 180 / Math.PI;
const kickOf = (token: string, ms = 100) => turnKick(parseMove(token), ms);

describe("wobbleAngle", () => {
  it("is zero when the turn ends, so it joins the turn without a jump", () => {
    expect(wobbleAngle(0, 1)).toBe(0);
    expect(wobbleAngle(-5, 1)).toBe(0);
  });

  it("is gone by WOBBLE_MS and stays gone", () => {
    expect(wobbleAngle(WOBBLE_MS, 1)).toBe(0);
    expect(wobbleAngle(WOBBLE_MS + 1, 1)).toBe(0);
    expect(wobbleAngle(10_000, 1)).toBe(0);
    // it has all but died away shortly before: well under a tenth of a degree
    expect(Math.abs(wobbleAngle(WOBBLE_MS - 20, 1)) * DEG).toBeLessThan(0.1);
  });

  it("never exceeds the maximum, scales with strength, and is slight", () => {
    let peak = 0;
    for (let t = 0; t <= WOBBLE_MS; t += 0.1) peak = Math.max(peak, Math.abs(wobbleAngle(t, 1)));
    expect(peak * DEG).toBeLessThanOrEqual(WOBBLE_MAX_DEG + 1e-9);
    expect(peak * DEG).toBeGreaterThan(WOBBLE_MAX_DEG - 0.05);
    expect(WOBBLE_MAX_DEG).toBeLessThanOrEqual(3);
    for (const t of [20, 45, 90, 150]) expect(Math.abs(wobbleAngle(t, 0.5))).toBeCloseTo(Math.abs(wobbleAngle(t, 1)) / 2, 9);
    // strength outside 0..1 is clamped
    expect(wobbleAngle(40, 5)).toBe(wobbleAngle(40, 1));
    expect(wobbleAngle(40, -1)).toBe(0);
  });

  it("swings first one way, then back, and the swings shrink", () => {
    expect(wobbleAngle(40, 1)).toBeGreaterThan(0);
    expect(wobbleAngle(125, 1)).toBeLessThan(0);
    expect(Math.abs(wobbleAngle(125, 1))).toBeLessThan(Math.abs(wobbleAngle(40, 1)));
  });

  it("is a pure function of its inputs", () => {
    expect(wobbleAngle(77.7, 0.6)).toBe(wobbleAngle(77.7, 0.6));
  });
});

describe("turnKick", () => {
  it("is none for a whole-cube rotation, for no turn and for a turn with no length", () => {
    for (const t of ["x", "y'", "z2"]) expect(kickOf(t)).toBeNull();
    expect(turnKick(null, 100)).toBeNull();
  });

  it("rocks about an axis perpendicular to the turn's", () => {
    expect(kickOf("R")!.axis).not.toBe(0);
    expect(kickOf("L'")!.axis).not.toBe(0);
    expect(kickOf("U")!.axis).not.toBe(1);
    expect(kickOf("F")!.axis).not.toBe(2);
    expect(kickOf("M")!.axis).not.toBe(0);
  });

  it("follows the turn's direction", () => {
    for (const face of ["R", "U", "F", "L", "D", "B", "M", "E", "S"]) {
      expect(kickOf(face)!.dir).toBe(-kickOf(face + "'")!.dir);
      expect(kickOf(face)!.axis).toBe(kickOf(face + "'")!.axis);
    }
    // R and L' turn the same way round about x (three.js), R and R' do not
    expect(kickOf("R")!.dir).toBe(kickOf("L'")!.dir);
    // the wobble's first swing carries that sign
    const k = kickOf("U")!;
    const swing = k.dir * wobbleAngle(40, k.strength);
    expect(Math.sign(swing)).toBe(k.dir);
  });

  it("hits harder for a quick turn and for a half turn", () => {
    expect(kickOf("R", 70)!.strength).toBeGreaterThan(kickOf("R", 200)!.strength);
    expect(kickOf("R2", 120)!.strength).toBeGreaterThan(kickOf("R", 120)!.strength);
    expect(kickOf("R2", 60)!.strength).toBeLessThanOrEqual(1);
    for (const ms of [0, 40, 60, 100, 220, 800, Number.NaN]) {
      const s = kickOf("U2", ms)!.strength;
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("wobbleAt", () => {
  const events = buildJiggleEvents(["R", "U", "x", "F2"], [0, 100, 200, 300], [90, 190, 290, 420]);

  it("skips rotations and orders events by end time", () => {
    expect(events.map((e) => e.endMs)).toEqual([90, 190, 420]);
  });

  it("is exactly zero before the first turn ends and at the moment each one ends (no jump), while earlier ones are over", () => {
    expect(wobbleAt(events, 50)).toEqual([0, 0, 0]);
    expect(wobbleAt(events, 90)).toEqual([0, 0, 0]);
    // turn 2 ends while turn 1 is still wobbling: its own kick adds nothing at that instant
    expect(wobbleAt(events, 190)).toEqual(wobbleAt(events.slice(0, 1), 190));
    expect(wobbleAt(events, 420)).toEqual(wobbleAt(events.slice(0, 2), 420));
    expect(wobbleAt(events.slice(0, 1), 90 + WOBBLE_MS)).toEqual([0, 0, 0]);
    expect(wobbleAt(events, 420 + WOBBLE_MS)).toEqual([0, 0, 0]);
    expect(wobbleAt(events, 420 + 5000)).toEqual([0, 0, 0]);
  });

  it("moves the cube soon after a turn, about the kick's axis only, and stays under the maximum", () => {
    const [x, y, z] = wobbleAt(events.slice(0, 1), 90 + 40);
    const k = events[0].kick;
    const v = [x, y, z];
    expect(Math.abs(v[k.axis])).toBeGreaterThan(0);
    for (let a = 0; a < 3; a++) if (a !== k.axis) expect(v[a]).toBe(0);
    for (let t = 0; t < 1200; t += 3) for (const c of wobbleAt(events, t)) expect(Math.abs(c) * DEG).toBeLessThanOrEqual(WOBBLE_MAX_DEG * 2);
  });

  it("is the same wherever it is asked from, in any order (scrubbing is exact)", () => {
    const ts = [10, 400, 130, 95, 230, 130, 700, 95];
    const first = ts.map((t) => wobbleAt(events, t));
    const again = [...ts].reverse().map((t) => wobbleAt(events, t)).reverse();
    expect(again).toEqual(first);
  });

  it("stretches with the time scale", () => {
    const fast = wobbleAt(events.slice(0, 1), 90 + 40, 1);
    const slow = wobbleAt(events.slice(0, 1), 90 + 80, 2);
    expect(slow).toEqual(fast);
  });

  it("a double played as two quarters kicks once, as the half turn, when its second quarter ends", () => {
    const e = buildJiggleEvents(["R2"], [0], [200], [{ firstStart: 0, secondEnd: 200 }]);
    expect(e).toHaveLength(1);
    expect(e[0].endMs).toBe(200);
    expect(e[0].kick.strength).toBeGreaterThan(kickOf("R", 200)!.strength);
    expect(e[0].kick.strength).toBe(kickOf("R2", 200)!.strength);
  });
});

describe("layerTilt", () => {
  it("is zero at both ends of the turn and peaks mid-turn at about a degree", () => {
    const t = (p: number) => layerTilt(parseMove("R"), p)!;
    expect(Math.abs(t(0).angle)).toBe(0);
    expect(Math.abs(t(1).angle)).toBeLessThan(1e-12);
    expect(Math.abs(t(0.5).angle) * DEG).toBeCloseTo(TILT_MAX_DEG, 6);
    expect(TILT_MAX_DEG).toBeGreaterThanOrEqual(1);
    expect(TILT_MAX_DEG).toBeLessThanOrEqual(1.5);
    for (let p = 0; p <= 1; p += 0.05) expect(Math.abs(t(p).angle) * DEG).toBeLessThanOrEqual(TILT_MAX_DEG + 1e-9);
  });

  it("is off the layer's own axis, flips with the direction, and is none for rotations", () => {
    expect(layerTilt(parseMove("R"), 0.5)!.axis).not.toBe(0);
    expect(layerTilt(parseMove("U"), 0.5)!.axis).not.toBe(1);
    expect(layerTilt(parseMove("R"), 0.5)!.angle).toBe(-layerTilt(parseMove("R'"), 0.5)!.angle);
    expect(layerTilt(parseMove("y"), 0.5)).toBeNull();
    expect(layerTilt(null, 0.5)).toBeNull();
  });
});

describe("rattleOffset", () => {
  const mag = (v: number[]) => Math.hypot(...v);
  it("is zero when the layer stops and once RATTLE_MS has passed", () => {
    expect(rattleOffset(0, 5, 1)).toEqual([0, 0, 0]);
    expect(rattleOffset(RATTLE_MS, 5, 1)).toEqual([0, 0, 0]);
    expect(rattleOffset(RATTLE_MS + 40, 5, 1)).toEqual([0, 0, 0]);
  });
  it("stays under a degree per axis and is deterministic", () => {
    let peak = 0;
    for (let t = 0; t < RATTLE_MS; t += 2) for (let c = 0; c < 26; c++) peak = Math.max(peak, ...rattleOffset(t, c, 1).map(Math.abs));
    expect(peak).toBeLessThan(Math.PI / 180);
    expect(peak).toBeGreaterThan(0);
    expect(rattleOffset(33, 7, 0.6)).toEqual(rattleOffset(33, 7, 0.6));
  });
  it("differs between cubies and scales with strength", () => {
    expect(rattleOffset(30, 1, 1)).not.toEqual(rattleOffset(30, 2, 1));
    expect(mag(rattleOffset(30, 3, 0.4))).toBeLessThan(mag(rattleOffset(30, 3, 1)));
    expect(rattleOffset(30, 3, 0)).toEqual([0, 0, 0]);
  });
});

describe("rattleAt", () => {
  const events = buildJiggleEvents(["R", "U"], [0, 200], [150, 350]);
  it("names the layer of the latest ended turn while it rattles", () => {
    const r = rattleAt(events, 350 + 40);
    expect(r?.turn).toEqual(parseMove("U"));
    expect(r?.ageMs).toBeCloseTo(40);
    expect(r?.strength).toBeGreaterThan(0);
  });
  it("is null before any turn ends, after RATTLE_MS and in the instant it ends", () => {
    expect(rattleAt(events, 100)).toBeNull();
    expect(rattleAt(events, 350)).toBeNull();
    expect(rattleAt(events, 350 + RATTLE_MS + 1)).toBeNull();
  });
  it("stretches with the playback speed and scales with gain", () => {
    expect(rattleAt(events, 350 + 40, 0.5)?.ageMs).toBeCloseTo(80);
    expect(rattleAt(events, 350 + 40, 1, 0.5)?.strength).toBeCloseTo((rattleAt(events, 390)?.strength ?? 0) / 2);
  });
});
