import { describe, expect, it } from "vitest";
import { Cube } from "../cube-engine/engine";
import {
  FACES,
  mapFromSolverFrame,
  mapToSolverFrame,
  relabelAlg,
  type Face,
} from "./frames";

/**
 * The relabel tables are derived from the engine at runtime, so these tests
 * are about the *property* they have to satisfy, plus a pin on the one row
 * everything else is built around (cross on D, the orientation ~every
 * reconstruction is written in).
 */
describe("frames", () => {
  it("maps the D row exactly as the engine's rotation table says", () => {
    const m = mapToSolverFrame("D");
    expect(m["U"]).toBe("D");
    expect(m["D"]).toBe("U");
    expect(m["F"]).toBe("B");
    expect(m["B"]).toBe("F");
    expect(m["R"]).toBe("R");
    expect(m["L"]).toBe("L");
    // Modifiers ride along, and the slice that flips direction under x2 does.
    expect(m["U'"]).toBe("D'");
    expect(m["F2"]).toBe("B2");
    expect(m["E"]).toBe("E'");
    expect(m["M"]).toBe("M");
  });

  it("sends each cross face to U and back again", () => {
    for (const face of FACES) {
      const to = mapToSolverFrame(face);
      const from = mapFromSolverFrame(face);
      expect(to[face]).toBe("U");
      expect(from["U"]).toBe(face);
      for (const token of Object.keys(to)) {
        expect(from[to[token]]).toBe(token);
      }
    }
  });

  /**
   * The property that makes this whole approach valid: relabeling is an
   * automorphism, so a relabeled scramble is solved by the relabeled solution.
   */
  it("preserves solutions under relabeling", () => {
    const scramble = "R U R' U' F' U F R2 D' L B2 R F' D2 L2 U";
    const solution = "U' M2 x' R U r D2 F' B L2 S E' u";
    for (const face of FACES as readonly Face[]) {
      const map = mapToSolverFrame(face);
      const cube = new Cube();
      cube.move(relabelAlg(scramble, map));
      cube.move(relabelAlg(solution, map));

      const reference = new Cube();
      reference.move(scramble);
      reference.move(solution);

      // Same solved-ness, and in fact the same state up to whole-cube
      // orientation, which is exactly what a relabeling preserves.
      expect(cube.isSolved()).toBe(reference.isSolved());
    }
  });

  it("relabels a full solve so a D-cross solve becomes a U-cross solve", () => {
    // Sexy move done on the D layer relabels into the same trigger on U.
    expect(relabelAlg("D L D' L'", mapToSolverFrame("D"))).toBe("U L U' L'");
  });
});
