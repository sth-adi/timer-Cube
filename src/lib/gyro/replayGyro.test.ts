import { describe, expect, it } from "vitest";
import { faceletsAfterMoves, solveMsAtPosition, streamQuatAt } from "./replayGyro";
import type { GyroStreamData } from "./solveGyro";

const stream: GyroStreamData = {
  atMs: [0, 100, 300],
  qx: [0, 0, 0],
  qy: [0, 0, 1],
  qz: [0, 0, 0],
  qw: [1, 1, 0],
};

describe("streamQuatAt", () => {
  it("holds the ends and is null with nothing recorded", () => {
    expect(streamQuatAt(null, 10)).toBeNull();
    expect(streamQuatAt({ atMs: [], qx: [], qy: [], qz: [], qw: [] }, 10)).toBeNull();
    expect(streamQuatAt(stream, -50)).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(streamQuatAt(stream, 9999)).toEqual({ x: 0, y: 1, z: 0, w: 0 });
  });
  it("interpolates between the samples either side", () => {
    expect(streamQuatAt(stream, 50)).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    const mid = streamQuatAt(stream, 200)!;
    expect(mid.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(mid.w).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe("solveMsAtPosition", () => {
  const starts = [0, 150, 300];
  const moveMs = [0, 1000, 1200];
  it("lands on each move's real time at its start", () => {
    starts.forEach((s, i) => expect(solveMsAtPosition(starts, moveMs, s)).toBe(moveMs[i]));
  });
  it("stretches the squeezed pause back out", () => {
    expect(solveMsAtPosition(starts, moveMs, 75)).toBe(500);
    expect(solveMsAtPosition(starts, moveMs, 225)).toBe(1100);
  });
  it("runs 1:1 outside the moves and never goes negative", () => {
    expect(solveMsAtPosition(starts, moveMs, 400)).toBe(1300);
    expect(solveMsAtPosition(starts, moveMs, -20)).toBe(0);
    expect(solveMsAtPosition([], [], 40)).toBe(40);
  });
});

describe("faceletsAfterMoves", () => {
  it("starts from the setup and shows each move's result", () => {
    const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const out = faceletsAfterMoves("", ["R", "R'"])!;
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(solved);
    expect(out[1]).not.toBe(solved);
    expect(out[2]).toBe(solved);
  });
  it("continues from a scramble", () => {
    const out = faceletsAfterMoves("R U", ["U'", "R'"])!;
    expect(out[2]).toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
  });
});
