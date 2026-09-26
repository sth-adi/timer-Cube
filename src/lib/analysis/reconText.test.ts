import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { IDENTITY, physicalFaceAt } from "@/lib/gyro/orientation";
import { simplify, toPhysicalTurns } from "@/lib/smartcube/route";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { CROSS_FACES } from "@/lib/smartcube/crossFrame";
import { solveBreakdown } from "./solveBreakdown";
import { crossBottomGrip, reconstruction } from "./reconText";

const saved = (scramble: string, moves: string[]): Solve => ({
  id: "s",
  sessionId: "x",
  penalty: "none",
  scramble,
  reconstruction: moves.join(" "),
  moveTimestamps: moves.map((_, i) => i * 150),
  timeMs: (moves.length - 1) * 150,
  date: 0,
});

describe("written reconstruction", () => {
  it("holds any cross colour on the bottom, green in front where it can be", () => {
    for (const f of CROSS_FACES) expect(physicalFaceAt(crossBottomGrip(f), "D")).toBe(f);
    expect(physicalFaceAt(crossBottomGrip("U"), "F")).toBe("F");
    expect(physicalFaceAt(crossBottomGrip("D"), "F")).toBe("F");
  });

  for (const face of ["U", "D"] as const) {
    it(`writes a ${face === "U" ? "white" : "yellow"}-cross solve that replays to exactly the turns made`, () => {
      const { scramble, moves } = fullSolveOn(face);
      const b = solveBreakdown(saved(scramble, moves))!;
      const r = reconstruction(b, scramble, { totalMs: b.totalMs });
      // Rotation + your-grip notation → the very turns the cube reported.
      const replayed = toPhysicalTurns(`${r.rotation} ${r.steps.flatMap((s) => s.moves).join(" ")}`, IDENTITY).turns;
      expect(simplify(replayed)).toEqual(simplify(moves));
      expect(r.steps.map((s) => s.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]);
      expect(r.text.split("\n")[0]).toMatch(/\/\/ inspection — .* top, .* front/);
      expect(r.text).toMatch(/\/\/ OLL: .+ \(\d+\.\d\ds, \d+ turns?\)/);
      expect(r.twizzleUrl).toMatch(/^https:\/\/alpha\.twizzle\.net\/edit\/\?setup-alg=/);
      if (face === "U") expect(r.gripLabel).toBe("yellow top, green front");
    }, 60_000);
  }
});
