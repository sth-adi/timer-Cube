import { newCube } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { viewerMove } from "@/lib/gyro/orientation";
import { colorOnTopGrip, crossSolved, mean, replayStates, type XraySolveInput } from "./common";

/**
 * Color Neutrality Scout. Every scramble hides six different crosses — one
 * per color — and on a given scramble some of them are far shorter than
 * the white one you actually solved. This measures, for each solve you did
 * on the smart cube:
 *
 *  - the provably shortest cross for all six colors (exact table lookup);
 *  - your real white cross: how many turns you used and how long it took;
 *
 * and turns that into the question worth answering before you spend months
 * learning color neutrality: *on your own scrambles, at your own cross
 * speed, how many seconds per solve would it actually buy you* — for
 * white/yellow dual neutrality, full neutrality, and each single extra color.
 */

export const CROSS_COLORS = ["U", "D", "F", "B", "R", "L"] as const;
export type CrossColor = (typeof CROSS_COLORS)[number];

export const CROSS_COLOR_NAME: Record<CrossColor, string> = {
  U: "White",
  D: "Yellow",
  F: "Green",
  B: "Blue",
  R: "Red",
  L: "Orange",
};

/**
 * Shortest cross (in turns) on each color's face for a scramble. A cube
 * scrambled by S, viewed with color C on top, is exactly a cube scrambled
 * by S re-labelled through that rotation — so each color's cross is the
 * white-cross table lookup on a relabelled scramble.
 */
export function crossLengthsByColor(scramble: string): Record<CrossColor, number> {
  const tokens = scramble.split(/\s+/).filter(Boolean);
  const out = {} as Record<CrossColor, number>;
  for (const color of CROSS_COLORS) {
    const grip = colorOnTopGrip(color);
    const cube = newCube();
    const relabelled = tokens.map((t) => viewerMove(t, grip)).join(" ");
    if (relabelled) cube.move(relabelled);
    out[color] = crossHeuristic(cube);
  }
  return out;
}

export interface NeutralitySolve {
  date: number;
  lengths: Record<CrossColor, number>;
  /** Turns you actually used for the (white) cross. */
  yourMoves: number;
  /** How long your cross took (ms from first turn to cross done). */
  yourMs: number;
}

export function analyzeNeutralitySolve(input: XraySolveInput & { date?: number }): NeutralitySolve | null {
  const { after } = replayStates(input.scramble, input.moves);
  const crossIdx = after.findIndex(crossSolved);
  if (crossIdx < 0) return null;
  return {
    date: input.date ?? 0,
    lengths: crossLengthsByColor(input.scramble),
    yourMoves: crossIdx + 1,
    yourMs: input.timesMs[crossIdx] ?? 0,
  };
}

export interface NeutralityOption {
  label: string;
  colors: CrossColor[];
  /** Mean shortest cross when free to pick among these colors. */
  avgOptimal: number;
  /** Mean turns saved per solve vs. white only. */
  turnsSaved: number;
  /** Mean ms saved per solve, at your own cross pace and efficiency. */
  msSaved: number;
  /** Share of solves where one of the extra colors was strictly shorter. */
  helpedRate: number;
}

export interface NeutralityReport {
  solves: number;
  /** Your mean cross turns / mean white-optimal turns — how close to optimal you already are. */
  efficiency: number;
  /** Your mean ms per cross turn. */
  msPerTurn: number;
  avgWhiteOptimal: number;
  avgYourMoves: number;
  avgYourMs: number;
  options: NeutralityOption[];
  /** The single extra color that would help most on its own. */
  bestSecondColor: NeutralityOption | null;
}

/**
 * Seconds are estimated conservatively: a shorter optimal cross is assumed
 * to cost you the same *ratio* of turns-to-optimal and the same ms per turn
 * as your white crosses actually do — no credit for the extra inspection
 * difficulty neutrality really brings, and none taken away either.
 */
export function buildNeutralityReport(solves: readonly NeutralitySolve[]): NeutralityReport | null {
  const valid = solves.filter((s) => s.yourMoves > 0 && s.yourMs > 0);
  if (valid.length === 0) return null;
  const avgWhiteOptimal = mean(valid.map((s) => s.lengths.U)) ?? 0;
  const avgYourMoves = mean(valid.map((s) => s.yourMoves)) ?? 0;
  const avgYourMs = mean(valid.map((s) => s.yourMs)) ?? 0;
  const efficiency = avgWhiteOptimal > 0 ? avgYourMoves / avgWhiteOptimal : 1;
  const msPerTurn = avgYourMoves > 0 ? avgYourMs / avgYourMoves : 0;

  const option = (label: string, colors: CrossColor[]): NeutralityOption => {
    const best = valid.map((s) => Math.min(...colors.map((c) => s.lengths[c])));
    const avgOptimal = mean(best) ?? 0;
    const turnsSaved = avgWhiteOptimal - avgOptimal;
    return {
      label,
      colors,
      avgOptimal,
      turnsSaved,
      msSaved: turnsSaved * efficiency * msPerTurn,
      helpedRate: valid.filter((s, i) => best[i] < s.lengths.U).length / valid.length,
    };
  };

  const singles = CROSS_COLORS.filter((c) => c !== "U").map((c) => option(`White + ${CROSS_COLOR_NAME[c]}`, ["U", c]));
  const bestSecondColor = [...singles].sort((a, b) => b.msSaved - a.msSaved)[0] ?? null;
  return {
    solves: valid.length,
    efficiency,
    msPerTurn,
    avgWhiteOptimal,
    avgYourMoves,
    avgYourMs,
    options: [option("Dual (white/yellow)", ["U", "D"]), option("Full neutral", [...CROSS_COLORS]), ...singles],
    bestSecondColor,
  };
}
