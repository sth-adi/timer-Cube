import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { solveCrossFromCube } from "@/lib/solvers/cross";
import { solvePairFromCube } from "@/lib/solvers/f2l";
import { F2L_PAIRS, pairHeuristic, type PairId } from "@/lib/solvers/data/pieceTablesClient";
import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { findCase } from "@/lib/algorithms/caseLookup";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { PAIR_LABELS, crossSolved, inGrip, slotGrip } from "@/lib/xray/common";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { myAlgKey } from "@/lib/algorithms/myAlgs";

/**
 * Solve Sat-Nav: from whatever state the cube in your hands is in right
 * now, the next leg of a CFOP solve — as the exact physical turns to make
 * (for tracking) and as notation in the grip you'd hold for it (for
 * reading). Every call starts from the live state, so going off-route just
 * means asking again: the Sat-Nav "recalculates" from wherever you are.
 *
 * Engine frame throughout: white cross on U, last layer on yellow D.
 */

export type NavStage = "cross" | "f2l" | "oll" | "pll" | "auf" | "solved" | "lost";

export interface NavStep {
  stage: NavStage;
  title: string;
  /** How to hold the cube to read `display`. */
  grip: string;
  /** Physical (center-color) turns — what the smart cube will report. */
  turns: string[];
  /** The same turns as notation in the suggested grip. */
  display: string[];
  /** For F2L: which pair; for OLL/PLL: the case. */
  pair?: number;
  caseName?: string;
  /** How many of the four F2L pairs are already done (for the progress bar). */
  pairsDone: number;
}

const HOME_GRIP_TEXT = "Yellow on top, green in front";

function pairsSolved(cube: CubeJSInstance): number[] {
  return [0, 1, 2, 3].filter((p) => f2lPairSolved(cube, p as 0 | 1 | 2 | 3));
}

function applied(cube: CubeJSInstance, turns: readonly string[]): CubeJSInstance {
  const c = cube.clone();
  if (turns.length) c.move(turns.join(" "));
  return c;
}

/** AUFs in the engine frame are D turns (the yellow layer). */
const AUFS = [[], ["D"], ["D2"], ["D'"]] as const;

/**
 * Finds the pre-AUF under which the book algorithm for this case actually
 * does the job from this exact state, held in the home grip — so the
 * Sat-Nav can say "U2, then R U R' U R U2 R'" rather than leave the
 * lining-up to you. With F2L solved, turning the top layer is equivalent
 * to turning the whole cube about the vertical axis, so the four AUFs
 * cover every way the case can sit.
 */
function lastLayerPlan(
  cube: CubeJSInstance,
  alg: string,
  goal: (c: CubeJSInstance) => boolean,
): { turns: string[]; display: string[] } | null {
  const { turns: algTurns } = toPhysicalTurns(alg, HOME_ORIENTATION);
  for (const auf of AUFS) {
    const turns = [...auf, ...algTurns];
    if (goal(applied(cube, turns))) {
      return { turns, display: [...inGrip(auf, HOME_ORIENTATION), ...alg.split(/\s+/).filter(Boolean)] };
    }
  }
  return null;
}

/** Your own algorithms by case ("OLL:Sune" → alg) — tried first, the book's if yours doesn't fit this state. */
export type AlgOverrides = Readonly<Record<string, string>>;

export function planNextStep(cube: CubeJSInstance, overrides: AlgOverrides = {}): NavStep {
  const done = pairsSolved(cube);

  if (cube.isSolved()) {
    return { stage: "solved", title: "Solved!", grip: "", turns: [], display: [], pairsDone: 4 };
  }

  if (!crossSolved(cube)) {
    const turns = solveCrossFromCube(cube);
    return {
      stage: "cross",
      title: `Cross · ${turns.length} turns`,
      grip: `${HOME_GRIP_TEXT} — white cross on the bottom`,
      turns,
      display: inGrip(turns, HOME_ORIENTATION),
      pairsDone: done.length,
    };
  }

  if (!bottomLayerSolved(cube)) {
    const open = [0, 1, 2, 3].filter((p) => !done.includes(p));
    const prior: PairId[] = done.map((p) => F2L_PAIRS[p]);
    // Solve the two most promising pairs exactly and take the shorter —
    // the one-table distance is a good but not perfect guide to which is
    // really easiest once the cross and solved pairs must be kept.
    const candidates = [...open].sort((a, b) => pairHeuristic(cube, F2L_PAIRS[a]) - pairHeuristic(cube, F2L_PAIRS[b])).slice(0, 2);
    let best: { pair: number; turns: string[] } | null = null;
    for (const p of candidates) {
      const turns = solvePairFromCube(cube, F2L_PAIRS[p], prior);
      if (turns && (!best || turns.length < best.turns.length)) best = { pair: p, turns };
    }
    if (best) {
      return {
        stage: "f2l",
        title: `${PAIR_LABELS[best.pair]} pair · ${best.turns.length} turns`,
        grip: `Yellow on top, ${PAIR_LABELS[best.pair].toLowerCase()} slot at front-right`,
        turns: best.turns,
        display: inGrip(best.turns, slotGrip(best.pair)),
        pair: best.pair,
        pairsDone: done.length,
      };
    }
  }

  const library = toLibraryFrame(cube);
  if (!orientationSolved(cube)) {
    const match = recognizeOll(library);
    const book = match ? findCase("OLL", match.case.name)?.alg : undefined;
    const mine = match ? overrides[myAlgKey("OLL", match.case.name)] : undefined;
    const goal = (c: CubeJSInstance) => bottomLayerSolved(c) && orientationSolved(c);
    const plan = (mine ? lastLayerPlan(cube, mine, goal) : null) ?? (book ? lastLayerPlan(cube, book, goal) : null);
    if (match && plan) {
      return {
        stage: "oll",
        title: `OLL · ${match.case.name}`,
        grip: HOME_GRIP_TEXT,
        turns: plan.turns,
        display: plan.display,
        caseName: match.case.name,
        pairsDone: 4,
      };
    }
  }

  // PLL (or just a final AUF).
  for (const auf of AUFS) {
    if (applied(cube, [...auf]).isSolved()) {
      return { stage: "auf", title: "Final AUF", grip: HOME_GRIP_TEXT, turns: [...auf], display: inGrip(auf, HOME_ORIENTATION), pairsDone: 4 };
    }
  }
  const match = recognizePll(library);
  const book = match ? findCase("PLL", match.case.name)?.alg : undefined;
  const mine = match ? overrides[myAlgKey("PLL", match.case.name)] : undefined;
  if (match && (book || mine)) {
    const goal = (c: CubeJSInstance) => AUFS.some((a) => applied(c, [...a]).isSolved());
    const plan = (mine ? lastLayerPlan(cube, mine, goal) : null) ?? (book ? lastLayerPlan(cube, book, goal) : null);
    if (plan) {
      const after = applied(cube, plan.turns);
      const post = AUFS.find((a) => applied(after, [...a]).isSolved()) ?? [];
      return {
        stage: "pll",
        title: `PLL · ${match.case.name}`,
        grip: HOME_GRIP_TEXT,
        turns: [...plan.turns, ...post],
        display: [...plan.display, ...inGrip(post, HOME_ORIENTATION)],
        caseName: match.case.name,
        pairsDone: 4,
      };
    }
  }

  // Anything the book doesn't cover (a pair search that ran out of budget,
  // a state outside the library): say so rather than guess.
  return { stage: "lost", title: "Off the map — solve on and the Sat-Nav picks you back up", grip: "", turns: [], display: [], pairsDone: done.length };
}

export function planFromFacelets(facelets: string, overrides: AlgOverrides = {}): NavStep {
  return planNextStep(Cube.fromString(facelets), overrides);
}
