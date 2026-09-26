import { describe, expect, it } from "vitest";
import { findCase } from "./caseLookup";
import { effectiveAlg, myAlgKey, solvesCase } from "./myAlgs";

describe("My Algs", () => {
  const tPerm = findCase("PLL", "T Perm")!;
  const sune = findCase("OLL", "Sune")!;

  it("accepts the book algorithm for its own case", () => {
    expect(solvesCase("PLL", tPerm.alg, tPerm.alg)).toBe(true);
    expect(solvesCase("OLL", sune.alg, sune.alg)).toBe(true);
  });

  it("accepts a different algorithm for the same case, from another angle", () => {
    // The same T-perm written from the back (y2, so R↔L and F↔B), and a Sune with a pre-AUF.
    expect(solvesCase("PLL", tPerm.alg, "y2 L U L' U' L' B L2 U' L' U' L U L' B'")).toBe(true);
    expect(solvesCase("OLL", sune.alg, "U2 R U R' U R U2 R'")).toBe(true);
  });

  it("rejects an algorithm for another case, and nonsense", () => {
    expect(solvesCase("PLL", tPerm.alg, "R U R' U R U2 R'")).toBe(false);
    expect(solvesCase("OLL", sune.alg, "R U2 R' U' R U' R'")).toBe(false);
    expect(solvesCase("PLL", tPerm.alg, "")).toBe(false);
    expect(solvesCase("PLL", tPerm.alg, "Q W E")).toBe(false);
  });

  it("uses your chosen algorithm where you have one", () => {
    const chosen = { [myAlgKey("PLL", "T-Perm")]: "mine" };
    expect(effectiveAlg(chosen, "PLL", "T-Perm", "book")).toBe("mine");
    expect(effectiveAlg(chosen, "PLL", "Y-Perm", "book")).toBe("book");
    expect(effectiveAlg(undefined, "PLL", "T-Perm", "book")).toBe("book");
  });
});
