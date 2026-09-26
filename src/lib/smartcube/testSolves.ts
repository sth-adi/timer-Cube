import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { solveCrossOptimal } from "@/lib/solvers/cross";
import { solveF2L } from "@/lib/solvers/f2l";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { relabelMove, toCrossFrame, type CrossFace } from "./crossFrame";

/**
 * Test helper: complete, realistic smart-cube solves (cross, four pairs,
 * OLL, PLL, AUF) on any cross colour, as the cube would report them. Only
 * imported by tests.
 */

// The solvers used here (IDA*, with a search budget) can't finish every last layer, so fullSolveOn tries these in turn.
export const TEST_SCRAMBLES = [
  "R2 U' B2 D' L2 D2 R2 U' F2 U L' B' R D F' U2 B R U2 F'",
  "D2 F' U2 L2 F U2 R2 B' L2 F' R' D B U R2 B L' U' F2 R",
  "F U2 L2 B2 U' R2 D L2 D' F2 R' B' L D' R U2 F R2 B' D",
  "B2 L2 D' R2 U2 B2 D F2 U' L2 R' B' D2 F U' R F2 L U' B",
];

/** A full solve of `scramble` with its cross on `face`, in physical turns. Throws if the solvers can't finish it. */
export function fullSolve(face: CrossFace, scramble: string): string[] {
  const framed = toCrossFrame(scramble.split(" "), face).join(" ");
  const cube = newCube();
  cube.move(framed);
  const out: string[] = [];
  const play = (ts: readonly string[]) => {
    if (ts.length) cube.move(ts.join(" "));
    out.push(...ts);
  };
  play(solveCrossOptimal(framed));
  // The F2L solver applies its own turns to the cube.
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
  if (!cube.isSolved()) throw new Error("didn't solve");
  // Name each turn by the physical face it was really on.
  const physical = (t: string) => ["U", "D", "F", "B", "R", "L"].find((f) => relabelMove(f, face) === t[0])! + t.slice(1);
  return out.map(physical);
}

/** The first of TEST_SCRAMBLES the solvers can finish with a cross on `face`. */
export function fullSolveOn(face: CrossFace): { scramble: string; moves: string[] } {
  for (const scramble of TEST_SCRAMBLES) {
    try {
      return { scramble, moves: fullSolve(face, scramble) };
    } catch {
      // Beyond the solvers' budget; try the next.
    }
  }
  throw new Error(`no test scramble solvable on ${face}`);
}
