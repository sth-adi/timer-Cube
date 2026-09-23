import { describe, expect, it } from "vitest";
import { identifyAlg, orderOf, pieceName } from "./algId";
import { toPhysicalTurns } from "./route";
import { HOME_ORIENTATION, mul, tokenMatrix } from "@/lib/gyro/orientation";

/** What a smart cube reports for a book alg done yellow-up (optionally from another side). */
const physical = (alg: string, ySteps = 0) => {
  let grip = HOME_ORIENTATION;
  for (let i = 0; i < ySteps; i++) grip = mul(tokenMatrix("y"), grip);
  return toPhysicalTurns(alg, grip).turns;
};

const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
const SUNE = "R U R' U R U2 R'";

describe("identifyAlg", () => {
  it("recognizes a book T-perm from any side", () => {
    for (const y of [0, 1, 2, 3]) {
      const id = identifyAlg(physical(T_PERM, y));
      expect(id.kind).toBe("pll");
      expect(id.caseName).toBe("T Perm");
      expect(id.isBookAlg).toBe(true);
      expect(id.notation).toBe(T_PERM);
      expect(id.layer).toBe("D");
      expect(id.order).toBe(2);
      expect(id.effect.cornerCycles.map((c) => c.length)).toEqual([2]);
      expect(id.effect.edgeCycles.map((c) => c.length)).toEqual([2]);
    }
  });

  it("recognizes an OLL and reports its effect", () => {
    const id = identifyAlg(physical(SUNE));
    expect(id.kind).toBe("oll");
    expect(id.caseName).toBe("Sune");
    expect(id.isBookAlg).toBe(true);
    expect(id.order).toBe(6);
    expect(id.htm).toBe(7);
    expect(id.qtm).toBe(8);
  });

  it("recognizes an alg done with a different face on top", () => {
    // Sune performed with white on top — physical U turns.
    const id = identifyAlg("R U R' U R U2 R'".split(" "));
    expect(id.layer).toBe("U");
    expect(id.kind).toBe("oll");
    expect(id.notation).toBe(SUNE);
  });

  it("handles sequences that aren't last-layer algorithms", () => {
    const sexy = identifyAlg("R U R' U'".split(" "));
    expect(sexy.kind).toBe("other");
    expect(sexy.layer).toBeNull();
    expect(sexy.order).toBe(6);
    const nothing = identifyAlg(["R", "R'"]);
    expect(nothing.kind).toBe("identity");
    expect(nothing.htm).toBe(0);
  });

  it("times the execution", () => {
    const id = identifyAlg(physical(SUNE), [0, 100, 200, 300, 400, 500, 600]);
    expect(id.durationMs).toBe(600);
    expect(id.tps).toBeCloseTo(10, 5);
  });

  it("names pieces by color", () => {
    expect(pieceName("corner", 0)).toBe("White-Red-Green");
    expect(pieceName("edge", 5)).toBe("Yellow-Green");
    expect(orderOf(["R"])).toBe(4);
  });
});
