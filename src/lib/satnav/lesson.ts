import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import type { NavStage } from "./planner";

/**
 * Sat-Nav's Learn mode: the same live CFOP planner, taught. Each stage
 * opens with what it's for and how to think about it, shows a live
 * progress meter read straight off the cube, and — in "try first" mode —
 * holds the route back behind a hint ladder so you work it out yourself
 * before being told. Engine frame (white U, yellow D), like the planner.
 */

export type LessonStage = Exclude<NavStage, "solved" | "lost">;

export interface Lesson {
  name: string;
  /** One line: what done looks like. */
  goal: string;
  /** How to think about it — what to look for. */
  how: string;
  /** The idea to take away once the stage is done. */
  takeaway: string;
}

export const LESSONS: Record<LessonStage, Lesson> = {
  cross: {
    name: "Cross",
    goal: "Four white edges on the bottom, each lined up with the center beside it.",
    how: "Find a white edge, look at its other color, and bring it under that color's center. Plan it before you turn — the cross never needs more than 8 turns.",
    takeaway: "Solving the cross on the bottom means you can already see the F2L pieces on top while you finish it.",
  },
  f2l: {
    name: "First two layers",
    goal: "Each white corner paired with its edge and dropped into the slot between their two centers.",
    how: "Get the corner and edge out on top, join them into a pair without breaking the cross, then insert the pair in one go. The Sat-Nav picks the easiest pair first.",
    takeaway: "Pairs are faster than corners-then-edges: one insertion places two pieces.",
  },
  oll: {
    name: "Orient last layer",
    goal: "The whole top face yellow.",
    how: "Look only at the yellow stickers on top — their shape is the case. Turn the top until it matches the algorithm's starting position, then run it.",
    takeaway: "OLL recognition is just the yellow pattern: learn the shapes, not the stickers on the sides.",
  },
  pll: {
    name: "Permute last layer",
    goal: "Every top piece moved to its own spot.",
    how: "Look for headlights — two corners on one side showing the same color. Where they are (or aren't) tells you the case.",
    takeaway: "Two sides of the top layer are enough to recognize any PLL.",
  },
  auf: {
    name: "Final turn",
    goal: "Line the top layer up with the rest.",
    how: "One turn of the top face finishes it.",
    takeaway: "Done — that's a full CFOP solve.",
  },
};

export interface StageProgress {
  done: number;
  total: number;
  label: string;
}

const count = (xs: readonly boolean[]) => xs.filter(Boolean).length;
const AUF_TURNS = ["", "D", "D2", "D'"];

/** How far into `stage` the cube is, read straight off its state. */
export function stageProgress(cube: CubeJSInstance, stage: LessonStage): StageProgress {
  switch (stage) {
    case "cross":
      return { done: count([0, 1, 2, 3].map((s) => cube.ep[s] === s && cube.eo[s] === 0)), total: 4, label: "cross edges placed" };
    case "f2l":
      return {
        done: count([0, 1, 2, 3].map((s) => cube.cp[s] === s && cube.co[s] === 0 && cube.ep[s + 8] === s + 8 && cube.eo[s + 8] === 0)),
        total: 4,
        label: "pairs in",
      };
    case "oll":
      return { done: count([4, 5, 6, 7].flatMap((s) => [cube.co[s] === 0, cube.eo[s] === 0])), total: 8, label: "top pieces facing up" };
    case "pll":
    case "auf": {
      // Best over the four top-layer turns: a piece that's right up to an AUF counts.
      let best = 0;
      for (const a of AUF_TURNS) {
        const c = cube.clone();
        if (a) c.move(a);
        best = Math.max(best, count([4, 5, 6, 7].flatMap((s) => [c.cp[s] === s, c.ep[s] === s])));
      }
      return { done: best, total: 8, label: "top pieces in place" };
    }
  }
}

export function stageProgressFromFacelets(facelets: string, stage: LessonStage): StageProgress {
  return stageProgress(Cube.fromString(facelets), stage);
}

/** The PLL and final-AUF legs are taught as one stage. */
export function lessonStageOf(stage: NavStage): LessonStage | null {
  return stage === "solved" || stage === "lost" ? null : stage;
}

/**
 * Hint ladder for "try first" mode: 0 = the goal only, 1 = the first turn,
 * 2 = the whole route. Stalling climbs it on its own after `STALL_HINT_MS`.
 */
export type HintLevel = 0 | 1 | 2;
export const STALL_HINT_MS = 7000;

export interface StageRecap {
  stage: LessonStage;
  /** Overrides the stage name, e.g. "Green-Red pair". */
  label?: string;
  /** Turns you actually made during the stage. */
  yourTurns: number;
  /** Length of the Sat-Nav's route when the stage began. */
  routeTurns: number;
  ms: number;
  /** Highest hint level you needed (try-first mode), or null in guided mode. */
  hint: HintLevel | null;
}

/** A one-line verdict on a finished stage. */
export function recapLine(r: StageRecap): string {
  const extra = r.yourTurns - r.routeTurns;
  const eff = extra <= 0 ? `in ${r.yourTurns} turns — as short as the Sat-Nav's route` : `in ${r.yourTurns} turns (${extra} more than the route's ${r.routeTurns})`;
  const help = r.hint === null ? "" : r.hint === 0 ? ", no hints" : r.hint === 1 ? ", with a first-turn hint" : ", with the full route";
  return `${r.label ?? LESSONS[r.stage].name} ${eff}${help}.`;
}
