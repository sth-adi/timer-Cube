import { describe, expect, it } from "vitest";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CROSS_FACES, relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";
import { fullSolveOn } from "./testSolves";
import { NO_MILESTONES, advanceMilestones, type Milestones } from "./milestones";

function run(moves: readonly string[], SCRAMBLE: string): Milestones {
  const live = newCube();
  live.move(SCRAMBLE);
  const frames = Object.fromEntries(
    CROSS_FACES.map((f) => {
      const c = newCube();
      c.move(toCrossFrame(SCRAMBLE.split(" "), f).join(" "));
      return [f, c];
    }),
  ) as Record<CrossFace, CubeJSInstance>;
  let m = NO_MILESTONES;
  moves.forEach((t, i) => {
    live.move(t);
    for (const f of CROSS_FACES) frames[f].move(relabelMove(t, f));
    m = advanceMilestones(m, live, (f) => frames[f], (i + 1) * 100);
  });
  expect(live.isSolved()).toBe(true);
  return m;
}

describe("live milestones", () => {
  for (const face of ["U", "D", "F"] as const) {
    it(`splits a ${face}-cross solve into every CFOP step`, () => {
      const solve = fullSolveOn(face);
      const m = run(solve.moves, solve.scramble);
      expect(m.crossFace).toBe(face);
      expect(m.crossAtMs).not.toBeNull();
      expect(m.f2lPairAtMs.every((x) => x !== null)).toBe(true);
      expect(m.f2lAtMs).toBe(Math.max(...(m.f2lPairAtMs as number[])));
      expect(m.ollAtMs).toBeGreaterThanOrEqual(m.f2lAtMs!);
      expect(m.ollCaseName).not.toBeNull();
      expect(m.pllCaseName).not.toBeNull();
      expect(m.crossAtMs!).toBeLessThanOrEqual(Math.min(...(m.f2lPairAtMs as number[])));
    }, 60_000);
  }
});
