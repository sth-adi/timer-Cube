import type { CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { isOllSkip, isPllSkip, recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { CROSS_FACES, crossSolvedOn, type CrossFace } from "./crossFrame";

/**
 * Where a live solve has got to: each CFOP milestone's first moment, and the cases faced.
 * A pair's time is when it last became solved and has stayed so — until the bottom layer is
 * complete, when they freeze — so a pair solved early, broken and re-inserted reads as
 * solved at the re-insertion, and the last pair's time is the same moment as `f2lAtMs`.
 */
export interface Milestones {
  crossFace: CrossFace | null;
  crossAtMs: number | null;
  f2lAtMs: number | null;
  f2lPairAtMs: (number | null)[];
  ollAtMs: number | null;
  ollCaseName: string | null;
  pllCaseName: string | null;
}

export const NO_MILESTONES: Milestones = {
  crossFace: null,
  crossAtMs: null,
  f2lAtMs: null,
  f2lPairAtMs: [null, null, null, null],
  ollAtMs: null,
  ollCaseName: null,
  pllCaseName: null,
};

export function pickMilestones(m: Milestones): Milestones {
  const { crossFace, crossAtMs, f2lAtMs, f2lPairAtMs, ollAtMs, ollCaseName, pllCaseName } = m;
  return { crossFace, crossAtMs, f2lAtMs, f2lPairAtMs, ollAtMs, ollCaseName, pllCaseName };
}

/**
 * Advances the milestones after one turn. Each is recorded only the first
 * time it's reached, so a coincidental alignment can't register twice and
 * breaking something apart later doesn't erase an earned split — except an
 * F2L pair, which has to be solved *now* to count until F2L is done (see
 * Milestones). The cross
 * can be any colour: the first face whose cross completes becomes the
 * solve's cross (white first on a tie), and everything after is read on
 * `frame(face)` — the live cube relabelled so that colour sits where white
 * does, where all the phase and case logic lives.
 */
export function advanceMilestones(m: Milestones, live: CubeJSInstance, frame: (face: CrossFace) => CubeJSInstance, atMs: number): Milestones {
  const newCrossFace = m.crossFace === null ? (CROSS_FACES.find((f) => crossSolvedOn(live, f)) ?? null) : null;
  const crossFace = m.crossFace ?? newCrossFace;
  // Always a fresh object of just the milestone fields: callers pass richer state (the store passes itself) and spread the result back.
  if (!crossFace) return pickMilestones(m);
  const cube = frame(crossFace);
  const f2lJustSolved = m.f2lAtMs === null && bottomLayerSolved(cube);
  const ollJustSolved = m.ollAtMs === null && bottomLayerSolved(cube) && orientationSolved(cube);
  let { ollCaseName, pllCaseName } = m;
  // Recognised on exactly the state in front of the cuber as each step starts.
  if (f2lJustSolved) {
    const lib = toLibraryFrame(cube);
    ollCaseName = isOllSkip(lib) ? "OLL skip" : (recognizeOll(lib)?.case.name ?? null);
  }
  if (ollJustSolved) {
    const lib = toLibraryFrame(cube);
    pllCaseName = isPllSkip(lib) ? "PLL skip" : (recognizePll(lib)?.case.name ?? null);
  }
  return {
    crossFace,
    crossAtMs: newCrossFace ? atMs : m.crossAtMs,
    f2lAtMs: f2lJustSolved ? atMs : m.f2lAtMs,
    // An x-cross's pair lands with its cross. A pair knocked out of its slot before F2L is done loses its time and gets a new one on re-insertion; once F2L is done the last layer is free to disturb them.
    f2lPairAtMs: m.f2lAtMs !== null ? m.f2lPairAtMs : m.f2lPairAtMs.map((at, i) => (f2lPairSolved(cube, i as 0 | 1 | 2 | 3) ? (at ?? atMs) : null)),
    ollAtMs: ollJustSolved ? atMs : m.ollAtMs,
    ollCaseName,
    pllCaseName,
  };
}
