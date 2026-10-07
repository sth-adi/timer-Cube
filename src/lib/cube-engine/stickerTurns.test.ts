import { describe, expect, it } from "vitest";
import { cubeFromAlg, newCube } from "./engine";
import { STICKERS, applyMove, applyTurn, inferMove, inferTurn, isPairMove, moveGeometry, moveToken, pairOf, parseMove, parseSlice, parseTurn, turnGeometry, turnToken } from "./stickerTurns";

const SCRAMBLES = ["", "R U R' U'", "F2 L' D B U2 R F' L2 D' B2 U", "B2 L2 D' R2 U2 B2 D F2 U' L2 R' B' D2 F U' R F2 L U' B"];
const TOKENS = ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2"];

describe("sticker layout", () => {
  it("has 54 distinct stickers, six per axis direction... nine on each face", () => {
    expect(STICKERS).toHaveLength(54);
    const keys = new Set(STICKERS.map((s) => `${s.cubie}|${s.normal}`));
    expect(keys.size).toBe(54);
  });
});

describe("applyTurn matches the engine", () => {
  for (const scramble of SCRAMBLES) {
    for (const token of TOKENS) {
      it(`${token} after "${scramble || "solved"}"`, () => {
        const before = cubeFromAlg(scramble).asString();
        const cube = cubeFromAlg(scramble);
        cube.move(token);
        expect(applyTurn(before, token)).toBe(cube.asString());
      });
    }
  }
});

describe("parseTurn / inferTurn", () => {
  it("reads the 18 face turns and nothing else", () => {
    expect(parseTurn("R")).toEqual({ face: "R", quarters: 1 });
    expect(parseTurn("U'")).toEqual({ face: "U", quarters: -1 });
    expect(parseTurn("F2")).toEqual({ face: "F", quarters: 2 });
    for (const bad of ["M", "r", "x", "Rw", "R3", ""]) expect(parseTurn(bad)).toBeNull();
    expect(turnToken({ face: "L", quarters: -1 })).toBe("L'");
  });
  it("finds the one turn between two states", () => {
    const solved = newCube().asString();
    for (const token of TOKENS) expect(inferTurn(solved, applyTurn(solved, token))).toEqual(parseTurn(token));
  });
  it("says null for a re-sync, two turns or no change", () => {
    const solved = newCube().asString();
    expect(inferTurn(solved, solved)).toBeNull();
    expect(inferTurn(solved, applyTurn(applyTurn(solved, "R"), "U"))).toBeNull();
    expect(inferTurn("UUU", solved)).toBeNull();
  });
});

describe("turnGeometry", () => {
  it("turns clockwise faces one way and the opposite faces the other, in CSS terms", () => {
    expect(turnGeometry({ face: "R", quarters: 1 })).toEqual({ axis: 0, layer: 1, degrees: 90 });
    expect(turnGeometry({ face: "L", quarters: 1 })).toEqual({ axis: 0, layer: -1, degrees: -90 });
    expect(turnGeometry({ face: "U", quarters: -1 })).toEqual({ axis: 1, layer: -1, degrees: 90 });
    expect(turnGeometry({ face: "F", quarters: 2 })).toEqual({ axis: 2, layer: 1, degrees: 180 });
  });
});

const SLICE_TOKENS = ["M", "M'", "M2", "E", "E'", "E2", "S", "S'", "S2", "x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"];
const PAIR_TOKENS = ["R' L", "R L'", "R2 L2", "L R'", "U D'", "U' D", "U2 D2", "F B'", "F' B", "F2 B2"];

describe("slice turns and rotations match the engine", () => {
  for (const scramble of SCRAMBLES) {
    for (const token of SLICE_TOKENS) {
      it(`${token} after "${scramble || "solved"}"`, () => {
        const before = cubeFromAlg(scramble).asString();
        const cube = cubeFromAlg(scramble);
        cube.move(token);
        expect(applyMove(before, token)).toBe(cube.asString());
      });
    }
    for (const token of PAIR_TOKENS) {
      it(`${token} (two opposite faces) after "${scramble || "solved"}"`, () => {
        const before = cubeFromAlg(scramble).asString();
        const cube = cubeFromAlg(scramble);
        cube.move(token);
        expect(applyMove(before, token)).toBe(cube.asString());
      });
    }
  }
  it("applyMove agrees with applyTurn on a face turn and leaves unknown tokens alone", () => {
    const solved = newCube().asString();
    for (const token of TOKENS) expect(applyMove(solved, token)).toBe(applyTurn(solved, token));
    expect(applyMove(solved, "Rw")).toBe(solved);
    expect(applyMove("UUU", "M")).toBe("UUU");
  });
});

describe("parseMove / parseSlice / moveToken", () => {
  it("reads slices and rotations, and still refuses everything parseTurn refuses", () => {
    expect(parseSlice("M")).toEqual({ slice: "M", quarters: 1 });
    expect(parseSlice("x'")).toEqual({ slice: "x", quarters: -1 });
    expect(parseSlice("E2")).toEqual({ slice: "E", quarters: 2 });
    for (const bad of ["R", "r", "Rw", "M3", "X", ""]) expect(parseSlice(bad)).toBeNull();
    expect(parseMove("R'")).toEqual({ face: "R", quarters: -1 });
    expect(parseMove("S")).toEqual({ slice: "S", quarters: 1 });
    expect(parseMove("w")).toBeNull();
    for (const t of [...TOKENS, ...SLICE_TOKENS]) expect(moveToken(parseMove(t)!)).toBe(t);
    // parseTurn is still faces only, so callers that use it to decide "animate or snap" keep snapping slices.
    expect(parseTurn("M")).toBeNull();
  });
});

describe("pairOf / moveGeometry", () => {
  it("accepts opposite faces turning the same way round and nothing else", () => {
    expect(pairOf({ face: "R", quarters: -1 }, { face: "L", quarters: 1 })).not.toBeNull(); // R' L, an M'
    expect(pairOf({ face: "R", quarters: 1 }, { face: "L", quarters: -1 })).not.toBeNull(); // R L', an M
    expect(pairOf({ face: "R", quarters: 2 }, { face: "L", quarters: 2 })).not.toBeNull();
    expect(pairOf({ face: "R", quarters: 1 }, { face: "L", quarters: 1 })).toBeNull(); // R L: the layers turn against each other
    expect(pairOf({ face: "R", quarters: 1 }, { face: "U", quarters: 1 })).toBeNull();
    expect(pairOf({ face: "R", quarters: 1 }, { face: "R", quarters: -1 })).toBeNull();
  });
  it("turns the middle layer for a slice, all three for a rotation, both outer ones for a pair", () => {
    expect(moveGeometry({ slice: "M", quarters: 1 })).toEqual({ axis: 0, parts: [{ layers: [0], degrees: -90, lag: 0 }] });
    expect(moveGeometry({ slice: "x", quarters: -1 }).parts[0]).toEqual({ layers: [-1, 0, 1], degrees: -90, lag: 0 });
    expect(moveGeometry({ slice: "y", quarters: 2 }).parts[0].degrees).toBe(-180);
    expect(moveGeometry({ face: "R", quarters: 1 })).toEqual({ axis: 0, parts: [{ layers: [1], degrees: 90, lag: 0 }] });
    const pair = pairOf({ face: "R", quarters: -1 }, { face: "L", quarters: 1 })!;
    expect(isPairMove(pair)).toBe(true);
    expect(moveGeometry(pair)).toEqual({ axis: 0, parts: [{ layers: [1, -1], degrees: -90, lag: 0 }] });
    const lagged = moveGeometry({ ...pair, lag: 0.4 });
    expect(lagged.parts).toEqual([
      { layers: [1], degrees: -90, lag: 0 },
      { layers: [-1], degrees: -90, lag: 0.4 },
    ]);
  });
  it("a half-turn pair spins both layers the same way", () => {
    const pair = pairOf({ face: "U", quarters: 2 }, { face: "D", quarters: 2 })!;
    expect(moveGeometry(pair).parts).toEqual([{ layers: [-1, 1], degrees: -180, lag: 0 }]);
  });
});

describe("inferMove", () => {
  const states = SCRAMBLES.map((s) => cubeFromAlg(s).asString());
  it("finds every face turn, slice turn, rotation and slice-shaped pair, whatever the cube", () => {
    for (const before of states) {
      for (const token of [...TOKENS, ...SLICE_TOKENS, ...PAIR_TOKENS]) {
        const after = applyMove(before, token);
        const move = inferMove(before, after);
        expect(move, token).not.toBeNull();
        // Whatever it is called, it must reproduce the state (R' L and L R' are the same pair, M2 is also x2 R2 L2 on a solved centre-fixed cube...).
        expect(applyMove(before, moveToken(move!))).toBe(after);
      }
    }
  });
  it("names the face turn first, and pairs by their faces", () => {
    const solved = newCube().asString();
    expect(inferMove(solved, applyTurn(solved, "R"))).toEqual({ face: "R", quarters: 1 });
    expect(inferMove(solved, applyMove(solved, "M"))).toEqual({ slice: "M", quarters: 1 });
    expect(inferMove(solved, applyMove(solved, "z'"))).toEqual({ slice: "z", quarters: -1 });
    const pair = inferMove(solved, applyMove(solved, "R' L"));
    expect(pair && isPairMove(pair)).toBe(true);
  });
  it("says null for a re-sync, an unrelated pair of turns or no change", () => {
    const solved = newCube().asString();
    expect(inferMove(solved, solved)).toBeNull();
    expect(inferMove(solved, applyMove(solved, "R U"))).toBeNull();
    expect(inferMove(solved, applyMove(solved, "R L"))).toBeNull(); // the layers turn against each other
    expect(inferMove("UUU", solved)).toBeNull();
  });
});
