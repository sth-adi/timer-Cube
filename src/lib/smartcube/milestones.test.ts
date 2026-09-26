import { describe, expect, it } from "vitest";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { CROSS_FACES, relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";
import { NO_MILESTONES, advanceMilestones, type Milestones } from "./milestones";

// The test's own solvers (IDA*, with a search budget) can't finish every last layer, so each colour uses the first of these they can.
const SCRAMBLES = [
  "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
  "D2 F' U2 L2 F U2 R2 B' L2 F' R' D B U R2 B L' U' F2 R",
  "F U2 L2 B2 U' R2 D L2 D' F2 R' B' L D' R U2 F R2 B' D",
  "B2 L2 D' R2 U2 B2 D F2 U' L2 R' B' D2 F U' R F2 L U' B",
];

/** A complete CFOP solve (cross, four pairs, OLL, PLL, AUF) with its cross on `face`, as the smart cube would report it. */
function fullSolve(face: CrossFace, SCRAMBLE: string): string[] {
  const framed = toCrossFrame(SCRAMBLE.split(" "), face).join(" ");
  const cube = newCube();
  cube.move(framed);
  const out: string[] = [];
  const play = (ts: readonly string[]) => {
    if (ts.length) cube.move(ts.join(" "));
    out.push(...ts);
  };
  play(solveCrossOptimal(framed));
  // The F2L, OLL and PLL solvers apply their own turns to the cube.
  out.push(...solveF2L(cube).flatMap((p) => p.moves));
  // The last layer by the book: recognise the case, then its algorithm from whichever angle works.
  const AUFS = [[], ["D"], ["D2"], ["D'"]];
  const lastLayer = (alg: string, done: (c: CubeJSInstance) => boolean) => {
    const turns = toPhysicalTurns(alg, HOME_ORIENTATION).turns;
    for (const pre of AUFS)
      for (const post of AUFS) {
        const c = cube.clone();
        c.move([...pre, ...turns, ...post].join(" "));
        if (done(c)) return play([...pre, ...turns, ...post]);
      }
    throw new Error(`no angle of ${alg} worked`);
  };
  const oll = recognizeOll(toLibraryFrame(cube));
  if (oll) lastLayer(oll.case.alg, (c) => bottomLayerSolved(c) && orientationSolved(c));
  const pll = recognizePll(toLibraryFrame(cube));
  if (pll) lastLayer(pll.case.alg, (c) => c.isSolved());
  for (const auf of AUFS) {
    const c = cube.clone();
    if (auf.length) c.move(auf[0]);
    if (c.isSolved()) {
      play(auf);
      break;
    }
  }
  expect(cube.isSolved()).toBe(true);
  // Name each turn by the physical face it was really on.
  const physical = (t: string) => ["U", "D", "F", "B", "R", "L"].find((f) => relabelMove(f, face) === t[0])! + t.slice(1);
  return out.map(physical);
}

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
      let solve: { scramble: string; moves: string[] } | null = null;
      const errs: string[] = [];
      for (const scramble of SCRAMBLES) {
        try {
          solve = { scramble, moves: fullSolve(face, scramble) };
          break;
        } catch (e) {
          // This scramble's last layer is beyond the test solver's budget; try the next.
          errs.push(String(e));
        }
      }
      expect(errs.length < SCRAMBLES.length ? "" : errs.join(" / ")).toBe("");
      const m = run(solve!.moves, solve!.scramble);
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
