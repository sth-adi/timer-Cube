import { describe, expect, it } from "vitest";
import { Cube } from "../cube-engine/engine";
import { OLL_CASES } from "../algorithms/ollData";
import { PLL_CASES } from "../algorithms/pllData";
import { invertAlg } from "../algorithms/algUtils";
import { isOllSkip, isPllSkip, recognizeOll, recognizePll, toLibraryFrame } from "./recognize";

const AUF = ["", "U", "U2", "U'"];

describe("last-layer recognition", () => {
  it("names every OLL case back from its own setup", () => {
    for (const c of OLL_CASES) {
      const cube = new Cube();
      cube.move(invertAlg(c.alg));
      const match = recognizeOll(cube);
      expect(match, `no match for ${c.name}`).not.toBeNull();
      expect(match!.case.id).toBe(c.id);
    }
  });

  it("names every OLL case regardless of AUF", () => {
    for (const c of OLL_CASES) {
      for (const auf of AUF) {
        const cube = new Cube();
        cube.move(`${invertAlg(c.alg)} ${auf}`);
        expect(recognizeOll(cube)?.case.id, `${c.name} + ${auf || "no AUF"}`).toBe(c.id);
      }
    }
  });

  it("names every PLL case back from its own setup", () => {
    for (const c of PLL_CASES) {
      const cube = new Cube();
      cube.move(invertAlg(c.alg));
      const match = recognizePll(cube);
      expect(match, `no match for ${c.name}`).not.toBeNull();
      expect(match!.case.id).toBe(c.id);
    }
  });

  it("names every PLL case regardless of AUF on either side", () => {
    for (const c of PLL_CASES) {
      for (const before of AUF) {
        for (const after of AUF) {
          const cube = new Cube();
          cube.move(`${before} ${invertAlg(c.alg)} ${after}`);
          expect(recognizePll(cube)?.case.id, `${c.name} ${before}/${after}`).toBe(c.id);
        }
      }
    }
  });

  it("treats a solved last layer as a skip, and an AUF away as a PLL skip", () => {
    const solved = new Cube();
    expect(isOllSkip(solved)).toBe(true);
    expect(isPllSkip(solved)).toBe(true);

    const aufOnly = new Cube();
    aufOnly.move("U");
    expect(isPllSkip(aufOnly)).toBe(true);

    const realCase = new Cube();
    realCase.move(invertAlg(PLL_CASES[0].alg));
    expect(isPllSkip(realCase)).toBe(false);
  });
});

describe("toLibraryFrame", () => {
  /** Library-frame move → the same physical turn in the cross-on-U solver frame (x2: U↔D, F↔B). */
  const toSolverFrame = (alg: string) =>
    alg
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => ({ U: "D", D: "U", F: "B", B: "F", R: "R", L: "L" })[t[0] as "U"] + t.slice(1))
      .join(" ");

  /** Only algs of plain face turns relabel by a simple face swap (wide turns / rotations would need more). */
  const faceTurnsOnly = (alg: string) => alg.split(/\s+/).filter(Boolean).every((t) => /^[URFDLB]['2]?$/.test(t));

  it("recognizes PLLs (and OLLs) set up in the solver frame", () => {
    const plls = PLL_CASES.filter((c) => faceTurnsOnly(c.alg));
    expect(plls.length).toBeGreaterThan(5);
    for (const c of plls) {
      const cube = new Cube();
      cube.move(toSolverFrame(`${invertAlg(c.alg)} U`));
      expect(recognizePll(toLibraryFrame(cube))?.case.name).toBe(c.name);
      expect(isPllSkip(toLibraryFrame(cube))).toBe(false);
    }
    for (const c of OLL_CASES.filter((o) => faceTurnsOnly(o.alg))) {
      const cube = new Cube();
      cube.move(toSolverFrame(invertAlg(c.alg)));
      expect(recognizeOll(toLibraryFrame(cube))?.case.name).toBe(recognizeOll(stateOf(invertAlg(c.alg)))?.case.name);
    }
  });

  it("reads a solved (or AUF-only) solver-frame cube as a PLL skip", () => {
    expect(isPllSkip(toLibraryFrame(new Cube()))).toBe(true);
    const auf = new Cube();
    auf.move("D2");
    expect(isPllSkip(toLibraryFrame(auf))).toBe(true);
  });
});

function stateOf(alg: string) {
  const c = new Cube();
  c.move(alg);
  return c;
}
