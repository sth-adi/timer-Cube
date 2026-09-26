import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { toLibraryFrame } from "@/lib/analysis/recognize";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { planNextStep } from "./planner";
import { RouteTracker, simplify, toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";

/** A library case (last layer on U, any wide/slice/rotation notation) as the engine-frame cube a smart cube would be in. */
function engineCase(alg: string) {
  const lib = new Cube();
  lib.move(invertAlg(alg));
  return toLibraryFrame(lib); // x2 relabelling is its own inverse
}

describe("toPhysicalTurns", () => {
  it("expands every book OLL and PLL (wide, slice, rotations) into face turns that really solve the case", () => {
    // Algs that open with a y are written for the case sitting a quarter
    // turn round, so allow the pre-AUF (and for PLL a post-AUF) a cuber would do.
    const aufs = ["", "D", "D2", "D'"];
    for (const c of [...OLL_CASES, ...PLL_CASES]) {
      const { turns } = toPhysicalTurns(c.alg, HOME_ORIENTATION);
      expect(turns.every((t) => /^[URFDLB]['2]?$/.test(t))).toBe(true);
      const works = aufs.some((pre) =>
        aufs.some((post) => {
          const after = engineCase(c.alg);
          after.move([pre, ...turns, post].filter(Boolean).join(" "));
          return c.group === "OLL" ? orientationSolved(after) && bottomLayerSolved(after) : after.isSolved();
        }),
      );
      expect(works, c.name).toBe(true);
    }
  });

  it("simplifies adjacent same-face turns", () => {
    expect(simplify(["R", "R", "U", "U'", "F2", "F"])).toEqual(["R2", "F'"]);
  });
});

describe("planNextStep", () => {
  it("names and routes every OLL and PLL case from the live state", () => {
    for (const c of [...OLL_CASES, ...PLL_CASES]) {
      for (const auf of ["", "D", "D2", "D'"]) {
        const cube = engineCase(c.alg);
        if (auf) cube.move(auf);
        const step = planNextStep(cube);
        expect(step.stage, `${c.name} ${auf}`).toBe(c.group === "OLL" ? "oll" : "pll");
        const after = cube.clone();
        after.move(step.turns.join(" "));
        if (c.group === "OLL") expect(orientationSolved(after) && bottomLayerSolved(after)).toBe(true);
        else expect(after.isSolved()).toBe(true);
      }
    }
  });

  it("drives a real scramble all the way to solved, stage by stage", () => {
    for (const scramble of ["R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'", "F U2 L2 B2 U' R2 D L2 D' F2 R' B' L D' R U2 F R2 B' D"]) {
      const cube = new Cube();
      cube.move(scramble);
      const stages: string[] = [];
      for (let i = 0; i < 12 && !cube.isSolved(); i++) {
        const step = planNextStep(cube);
        stages.push(step.stage);
        expect(step.display).toHaveLength(step.turns.length);
        if (step.turns.length) cube.move(step.turns.join(" "));
      }
      expect(cube.isSolved()).toBe(true);
      expect(stages[0]).toBe("cross");
      expect(stages.filter((s) => s === "f2l").length).toBeLessThanOrEqual(4);
      expect(planNextStep(cube).stage).toBe("solved");
    }
  });
});

describe("RouteTracker", () => {
  it("follows a route, accepting half turns as two quarters either way", () => {
    const t = new RouteTracker(["R", "U2", "R'"]);
    expect(t.push("R")).toBe("progress");
    expect(t.push("U'")).toBe("partial");
    expect(t.push("U'")).toBe("progress");
    expect(t.push("R'")).toBe("done");
    expect(t.finished).toBe(true);
  });

  it("flags wrong faces and wrong directions", () => {
    expect(new RouteTracker(["R"]).push("L")).toBe("off-route");
    expect(new RouteTracker(["R"]).push("R'")).toBe("off-route");
    const t = new RouteTracker(["U2"]);
    expect(t.push("U")).toBe("partial");
    expect(t.push("U'")).toBe("partial"); // undid it
    expect(t.push("U2")).toBe("done");
  });
});

describe("planner with your own algorithms", () => {
  it("uses your algorithm for a case when you've chosen one, and the book's otherwise", () => {
    const tPerm = PLL_CASES.find((c) => c.name === "T Perm")!;
    const cube = engineCase(tPerm.alg);
    const book = planNextStep(cube);
    expect(book.stage).toBe("pll");
    // The same T-perm written from the back: different notation, same case.
    const mine = "y2 L U L' U' L' B L2 U' L' U' L U L' B'";
    const withMine = planNextStep(cube, { "PLL:T Perm": mine });
    expect(withMine.display.join(" ")).toContain("L U L' U' L' B L2");
    const after = cube.clone();
    after.move(withMine.turns.join(" "));
    expect(after.isSolved()).toBe(true);
  });

  it("falls back to the book algorithm when yours doesn't fit the case", () => {
    const tPerm = PLL_CASES.find((c) => c.name === "T Perm")!;
    const cube = engineCase(tPerm.alg);
    const step = planNextStep(cube, { "PLL:T Perm": "R U R' U R U2 R'" });
    const after = cube.clone();
    after.move(step.turns.join(" "));
    expect(after.isSolved()).toBe(true);
  });
});
