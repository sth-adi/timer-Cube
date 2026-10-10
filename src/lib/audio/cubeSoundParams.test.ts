import { describe, expect, it } from "vitest";
import {
  KNOCK_MAX_HZ,
  KNOCK_MIN_HZ,
  classifyToken,
  generateTurnParams,
  intensityForSpeed,
  panForToken,
  seededRng,
} from "./cubeSoundParams";

describe("classifyToken", () => {
  it("classifies layers and half turns", () => {
    expect(classifyToken("R")).toEqual({ base: "R", layer: "face", double: false });
    expect(classifyToken("U2")).toMatchObject({ layer: "face", double: true });
    expect(classifyToken("F'")).toMatchObject({ base: "F", layer: "face" });
    expect(classifyToken("r")).toMatchObject({ layer: "wide" });
    expect(classifyToken("Rw'")).toMatchObject({ layer: "wide" });
    expect(classifyToken("M2")).toMatchObject({ layer: "slice", double: true });
    expect(classifyToken("y")).toMatchObject({ layer: "rotation" });
    expect(classifyToken("")).toMatchObject({ layer: "face" });
  });
});

describe("pan", () => {
  it("leans left for L, right for R, stays small", () => {
    expect(panForToken(classifyToken("L"))).toBeLessThan(0);
    expect(panForToken(classifyToken("R"))).toBeGreaterThan(0);
    for (const t of ["U", "D", "L", "R", "F", "B", "M", "E", "S", "x", "y", "z"]) {
      expect(Math.abs(panForToken(classifyToken(t)))).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("generateTurnParams", () => {
  it("is deterministic for a seed and varies along the sequence", () => {
    const a = seededRng(7);
    const b = seededRng(7);
    expect(generateTurnParams("R", 3, 120, a)).toEqual(generateTurnParams("R", 3, 120, b));
    const rng = seededRng(7);
    const p1 = generateTurnParams("R", 3, 120, rng);
    const p2 = generateTurnParams("R", 3, 120, rng);
    expect(p1.knocks[0]!.freq).not.toBe(p2.knocks[0]!.freq);
    expect(p1.click.durS).not.toBe(p2.click.durS);
  });

  it("keeps every parameter inside the physical ranges", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 400; i++) {
      const token = ["R", "U'", "L2", "F", "B", "D", "r", "M", "S'", "x"][i % 10]!;
      const p = generateTurnParams(token, rng() * 12, 30 + rng() * 600, rng);
      expect(p.click.durS).toBeGreaterThanOrEqual(0.002);
      expect(p.click.durS).toBeLessThanOrEqual(0.006);
      for (const k of p.knocks) {
        expect(k.freq).toBeGreaterThanOrEqual(KNOCK_MIN_HZ);
        expect(k.freq).toBeLessThanOrEqual(KNOCK_MAX_HZ);
        expect(k.decayS * 4.6).toBeLessThan(0.065); // time to -40 dB
      }
      expect(p.thud.freq).toBeGreaterThanOrEqual(110);
      expect(p.thud.freq).toBeLessThanOrEqual(250);
      expect(Math.abs(p.pan)).toBeLessThanOrEqual(0.4);
      const total = p.click.gain + p.knocks.reduce((s, k) => s + k.gain, 0) + p.thud.gain + p.settle.gain;
      expect(total).toBeLessThan(1.6); // sums rarely coincide; the limiter handles the rest
      expect(p.sample.rate).toBeGreaterThan(0.9);
      expect(p.sample.rate).toBeLessThan(1.2);
    }
  });

  it("gets louder and brighter with speed", () => {
    const slow = generateTurnParams("R", 1, 150, seededRng(3));
    const fast = generateTurnParams("R", 8, 150, seededRng(3));
    expect(fast.click.gain).toBeGreaterThan(slow.click.gain);
    expect(fast.click.centerHz).toBeGreaterThan(slow.click.centerHz);
    expect(fast.click.durS).toBeLessThan(slow.click.durS);
    expect(intensityForSpeed(100)).toBe(1);
    expect(intensityForSpeed(-1)).toBe(0);
  });

  it("makes slices softer and lower, rotations a whoosh", () => {
    const face = generateTurnParams("R", 4, 150, seededRng(5));
    const slice = generateTurnParams("M", 4, 150, seededRng(5));
    const rot = generateTurnParams("y", 4, 150, seededRng(5));
    expect(slice.click.gain).toBeLessThan(face.click.gain);
    expect(slice.knocks[0]!.freq).toBeLessThan(face.knocks[0]!.freq);
    expect(rot.knocks).toHaveLength(0);
    expect(rot.whoosh).not.toBeNull();
    expect(face.whoosh).toBeNull();
  });

  it("only scrapes when the turn is slow enough, and scrape follows duration", () => {
    expect(generateTurnParams("R", 8, 60, seededRng(2)).scrape).toBeNull();
    const a = generateTurnParams("R", 2, 200, seededRng(2)).scrape!;
    const b = generateTurnParams("R", 2, 400, seededRng(2)).scrape!;
    expect(b.durS).toBeGreaterThan(a.durS);
    expect(a.durS).toBeLessThan(0.2);
  });
});
