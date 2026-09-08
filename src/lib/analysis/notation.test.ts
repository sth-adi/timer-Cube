import { describe, expect, it } from "vitest";
import { Cube } from "../cube-engine/engine";
import { countMoves, movesToAlg, parseMoves } from "./notation";

const tokens = (input: string) => parseMoves(input).moves.map((m) => m.token);

describe("reconstruction parsing", () => {
  it("reads plain notation", () => {
    expect(tokens("R U R' U2 F2")).toEqual(["R", "U", "R'", "U2", "F2"]);
  });

  it("accepts all three spellings of a wide move", () => {
    expect(tokens("Rw r 2R")).toEqual(["r", "r", "r"]);
    expect(tokens("Rw' Uw2")).toEqual(["r'", "u2"]);
  });

  it("normalizes curly quotes, uppercase rotations and redundant modifiers", () => {
    expect(tokens("R’ U′ X Y2 Z'")).toEqual(["R'", "U'", "x", "y2", "z'"]);
    // R2' and R'2 are both half turns; R3 and R'' are quarter turns.
    expect(tokens("R2' R'2 R3 R''")).toEqual(["R2", "R2", "R'", "R"]);
  });

  it("ignores brackets, separators and comments", () => {
    expect(tokens("[R, U] (F') // sexy\nD2 /* block */ L")).toEqual(["R", "U", "F'", "D2", "L"]);
    expect(tokens("R U R' U' . R U R'")).toEqual(["R", "U", "R'", "U'", "R", "U", "R'"]);
  });

  it("reports what it can't read, without throwing, and keeps scanning", () => {
    const result = parseMoves("R Q U 3Rw R4");
    expect(result.moves.map((m) => m.token)).toEqual(["R", "U"]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain('"Q"');
    expect(result.errors[1]).toContain("3 layers");
    expect(result.errors[2]).toContain("360");
  });

  it("produces tokens the cube engine accepts", () => {
    const alg = movesToAlg(parseMoves("Rw2 M' E S2 x y' z2 u d' L B'").moves);
    const cube = new Cube();
    expect(() => cube.move(alg)).not.toThrow();
  });

  it("counts the metrics cubers actually quote", () => {
    // 5 turns, one of them a half turn, plus a rotation that costs no turn.
    const m = countMoves(parseMoves("R U2 y R' M F").moves);
    expect(m.stm).toBe(5);
    expect(m.etm).toBe(6);
    expect(m.qtm).toBe(6);
    expect(m.rotations).toBe(1);
  });
});
