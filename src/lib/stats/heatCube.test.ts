import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { computeHeatCube, countFaceTurns, faceOfToken, hasEnoughHeat, heatStep, heatView, stickerFills } from "./heatCube";

function solve(reconstruction: string, moveTimestamps?: number[]): Solve {
  return { id: "s", sessionId: "a", timeMs: 10000, penalty: "none", scramble: "", date: 0, reconstruction, moveTimestamps };
}

describe("faceOfToken", () => {
  it("reads face, wide and primed turns, and skips rotations and slices", () => {
    expect(faceOfToken("R'")).toBe("R");
    expect(faceOfToken("U2")).toBe("U");
    expect(faceOfToken("Rw")).toBe("R");
    expect(faceOfToken("f")).toBe("F");
    expect(faceOfToken("x")).toBeNull();
    expect(faceOfToken("M2")).toBeNull();
    expect(faceOfToken("")).toBeNull();
  });
});

describe("countFaceTurns", () => {
  it("counts every face turn, not rotations, across solves", () => {
    const counts = countFaceTurns([solve("R U R' U' x D"), solve("  R2   B "), { ...solve(""), reconstruction: undefined }]);
    expect(counts).toEqual({ U: 2, R: 3, F: 0, D: 1, L: 0, B: 1 });
  });
});

describe("computeHeatCube", () => {
  it("shares add to one and untimed solves give no speed", () => {
    const data = computeHeatCube([solve("R U R' U' R U R' U'")]);
    expect(data.totalTurns).toBe(8);
    expect(data.faces.reduce((n, f) => n + f.share, 0)).toBeCloseTo(1);
    expect(data.hasSpeed).toBe(false);
    expect(data.faces.every((f) => f.avgGapMs === null)).toBe(true);
  });

  it("trusts a face's speed only with enough timed turns, and needs three such faces", () => {
    const moves = ["R", "U", "F", "R", "U", "F", "R", "U", "F", "R", "U", "F", "R", "U", "F", "R", "U", "F"];
    const stamps = moves.map((_, i) => i * 100);
    const data = computeHeatCube([solve(moves.join(" "), stamps)]);
    expect(data.hasSpeed).toBe(true);
    expect(data.faces.find((f) => f.face === "R")?.avgGapMs).toBe(100);
    expect(data.faces.find((f) => f.face === "D")?.avgGapMs).toBeNull();
  });
});

describe("hasEnoughHeat", () => {
  it("hides below the turn floor or with fewer than three faces in play", () => {
    expect(hasEnoughHeat(computeHeatCube([solve("R U R' U'")]))).toBe(false);
    expect(hasEnoughHeat(computeHeatCube([solve(Array(80).fill("R U").join(" "))]))).toBe(false);
    expect(hasEnoughHeat(computeHeatCube([solve(Array(30).fill("R U F").join(" "))]))).toBe(true);
  });
});

describe("heatStep", () => {
  it("bins equally, pins the ends and puts a flat range mid-ramp", () => {
    expect(heatStep(0, 0, 10)).toBe(0);
    expect(heatStep(10, 0, 10)).toBe(4);
    expect(heatStep(5, 0, 10)).toBe(2);
    expect(heatStep(3.9, 0, 10)).toBe(1);
    expect(heatStep(7, 7, 7)).toBe(2);
  });
});

describe("heatView", () => {
  const data = computeHeatCube([solve(Array(20).fill("R R R U U F").join(" "))]);
  it("ranks by share in the often mode and leaves unused faces null", () => {
    const v = heatView(data, "often");
    expect(v.steps.R).toBe(4);
    expect(v.steps.F).toBe(0);
    expect(v.steps.D).toBeNull();
    expect(v.range?.max).toBeCloseTo(0.5);
  });
  it("has no range in the slow mode without timed turns", () => {
    expect(heatView(data, "slow").range).toBeNull();
  });
});

describe("stickerFills", () => {
  it("lists nine stickers per face in U R F D L B order", () => {
    const fills = stickerFills((f) => f);
    expect(fills).toHaveLength(54);
    expect(fills[0]).toBe("U");
    expect(fills[9]).toBe("R");
    expect(fills[53]).toBe("B");
  });
});
