import { describe, expect, it } from "vitest";
import { cubeFromAlg, newCube } from "./engine";
import { STICKERS, applyTurn, inferTurn, parseTurn, turnGeometry, turnToken } from "./stickerTurns";

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
