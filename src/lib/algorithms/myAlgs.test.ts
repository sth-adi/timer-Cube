import { describe, expect, it } from "vitest";
import { findCase } from "./caseLookup";
import { invertAlg } from "./algUtils";
import type { AlgExecution } from "@/lib/xray/algMicroscope";
import { MAIN_AFTER, alignToCase, autoMainAlg, effectiveAlg, learnFromExecutions, myAlgKey, normalizedAlg, sameAlg, solvesCase } from "./myAlgs";

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

  describe("learning yours from your solves", () => {
    const book = (group: "OLL" | "PLL", name: string) => findCase(group, name)?.alg;
    const exec = (alg: string, over: Partial<AlgExecution> = {}): AlgExecution => ({
      step: "PLL",
      caseName: "T Perm",
      alg,
      tokens: alg.split(" "),
      recognitionMs: 500,
      executionMs: 1500,
      gaps: [],
      date: 1,
      oneLook: true,
      clean: true,
      mergedAlg: alg,
      ...over,
    });
    // A T-perm is its own inverse, so the book algorithm backwards is a different algorithm for the same case.
    const altT = invertAlg(tPerm.alg);

    it("reads the same algorithm the same however it's written", () => {
      expect(sameAlg(sune.alg, `U ${sune.alg} U'`)).toBe(true);
      expect(sameAlg(sune.alg, "R U R' U R U U R'")).toBe(true);
      expect(sameAlg(tPerm.alg, "y2 L U L' U' L' B L2 U' L' U' L U L' B'")).toBe(true);
      expect(sameAlg(tPerm.alg, altT)).toBe(false);
      expect(normalizedAlg("Q W E")).toBeNull();
    });

    it("adds your own one-look algorithm to the case, and tells you once", () => {
      const first = learnFromExecutions({}, [exec(tPerm.alg), exec(altT, { executionMs: 1300 })], book);
      const list = first.seen[myAlgKey("PLL", "T Perm")];
      // Equal counts: the faster one first.
      expect(list.map((x) => [x.alg, x.book])).toEqual([
        [altT, false],
        [tPerm.alg, true],
      ]);
      expect(first.fresh).toHaveLength(1);
      expect(first.fresh[0].alg).toBe(altT);
      const again = learnFromExecutions(first.seen, [exec(altT, { executionMs: 1100 })], book);
      expect(again.fresh).toHaveLength(0);
      const mine = again.seen[myAlgKey("PLL", "T Perm")][0];
      expect(mine).toMatchObject({ alg: altT, count: 2, bestExecMs: 1100, book: false });
    });

    it("writes your algorithm from the book's angle, with the AUFs it needs", async () => {
      const { newCube } = await import("@/lib/cube-engine/engine");
      const { toPhysicalTurns } = await import("@/lib/smartcube/route");
      const { HOME_ORIENTATION } = await import("@/lib/gyro/orientation");
      const { invertMoves } = await import("@/lib/xray/common");
      const { orientationSolved, bottomLayerSolved } = await import("@/lib/solvers/oll");
      const run = (bookAlg: string, alg: string) => {
        const c = newCube();
        c.move(invertMoves(toPhysicalTurns(bookAlg, HOME_ORIENTATION).turns).join(" "));
        c.move(toPhysicalTurns(alg, HOME_ORIENTATION).turns.join(" "));
        return c;
      };
      // The book's own algorithm needs nothing added; one held from another side gets its AUF.
      const fromSide = alignToCase("OLL", sune.alg, sune.alg)!;
      expect(fromSide).toBe(sune.alg);
      const turned = alignToCase("OLL", sune.alg, "y R U R' U R U2 R' y'");
      expect(turned).not.toBeNull();
      const oll = run(sune.alg, turned!);
      expect(bottomLayerSolved(oll) && orientationSolved(oll)).toBe(true);
      const t = alignToCase("PLL", tPerm.alg, `U ${altT}`)!;
      expect(run(tPerm.alg, t).isSolved()).toBe(true);
      expect(alignToCase("PLL", tPerm.alg, sune.alg)).toBeNull();
    });

    it("ignores two-look and fumbled executions, and anything that doesn't solve the case", () => {
      const r = learnFromExecutions({}, [exec(altT, { oneLook: false }), exec(altT, { clean: false }), exec(sune.alg)], book);
      expect(r.seen).toEqual({});
      expect(r.fresh).toEqual([]);
    });

    it("makes yours the main algorithm once you use it most", () => {
      const once = learnFromExecutions({}, [exec(altT)], book).seen[myAlgKey("PLL", "T Perm")];
      expect(autoMainAlg(once)).toBeNull();
      const list = learnFromExecutions({}, Array.from({ length: MAIN_AFTER }, () => exec(altT)).concat(exec(tPerm.alg)), book).seen[myAlgKey("PLL", "T Perm")];
      expect(autoMainAlg(list)).toBe(altT);
      expect(autoMainAlg(list, [normalizedAlg(altT)!])).toBeNull();
      const bookMost = learnFromExecutions({}, [exec(tPerm.alg), exec(tPerm.alg), exec(tPerm.alg), exec(altT), exec(altT)], book).seen[myAlgKey("PLL", "T Perm")];
      expect(autoMainAlg(bookMost)).toBeNull();
    });
  });
});
