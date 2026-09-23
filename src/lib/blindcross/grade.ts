import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { simplify } from "@/lib/smartcube/route";
import { FACE_COLOR_NAMES } from "@/lib/gyro/orientation";
import { PAIR_LABELS, crossSolved } from "@/lib/xray/common";

/**
 * Blind Cross: the lookahead drill every coach prescribes — inspect, close
 * your eyes, solve the cross — graded by the cube itself. Because the
 * cross distance table is exact, the grader can replay your turns and say
 * not only whether it worked but precisely where your plan left the
 * optimal path.
 */

export type BlindLevel = "cross" | "xcross";

export type EdgeStatus = "solved" | "flipped" | "misplaced";

export interface BlindCrossResult {
  level: BlindLevel;
  success: boolean;
  /** The executed turns, with same-face turns merged (R R → R2). */
  moves: string[];
  turns: number;
  /** Fewest turns the cross needed from the scramble. */
  optimal: number;
  /** Cross distance at the start and after every move. */
  trail: number[];
  /** Leading turns that each brought the cross exactly one turn closer. */
  onPlan: number;
  /** Index (into `moves`) of the first turn that didn't — null if none did. */
  wanderedAt: number | null;
  edges: { name: string; status: EdgeStatus }[];
  /** For x-cross: the pair that ended up solved alongside the cross. */
  pair: string | null;
  verdict: string;
  detail: string;
}

const CROSS_COLORS = ["R", "F", "L", "B"];

function edgeStatuses(cube: CubeJSInstance): { name: string; status: EdgeStatus }[] {
  return CROSS_COLORS.map((c, piece) => {
    const slot = cube.ep.indexOf(piece);
    const status: EdgeStatus = slot !== piece ? "misplaced" : cube.eo[slot] !== 0 ? "flipped" : "solved";
    return { name: `white-${FACE_COLOR_NAMES[c]}`, status };
  });
}

/** Whether an x-cross is done: cross plus any one F2L pair. Returns the pair's index, or null. */
export function solvedPair(cube: CubeJSInstance): number | null {
  for (let i = 0; i < 4; i++) if (f2lPairSolved(cube, i as 0 | 1 | 2 | 3)) return i;
  return null;
}

export function isBlindTargetDone(level: BlindLevel, cube: CubeJSInstance): boolean {
  return crossSolved(cube) && (level === "cross" || solvedPair(cube) !== null);
}

export function gradeBlindCross(scramble: string, rawMoves: readonly string[], level: BlindLevel): BlindCrossResult {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const optimal = crossHeuristic(cube);
  const moves = simplify(rawMoves);
  const trail = [optimal];
  for (const m of moves) {
    cube.move(m);
    trail.push(crossHeuristic(cube));
  }

  let onPlan = 0;
  let wanderedAt: number | null = null;
  for (let i = 0; i < moves.length; i++) {
    if (trail[i] === 0) break;
    if (trail[i + 1] === trail[i] - 1) onPlan++;
    else {
      wanderedAt = i;
      break;
    }
  }

  const edges = edgeStatuses(cube);
  const pairIndex = crossSolved(cube) ? solvedPair(cube) : null;
  const success = isBlindTargetDone(level, cube);
  const wrong = edges.filter((e) => e.status !== "solved");
  const extra = moves.length - optimal;

  let verdict: string;
  let detail: string;
  if (success) {
    verdict =
      level === "xcross"
        ? `X-cross solved blind — ${PAIR_LABELS[pairIndex!]} pair included.`
        : extra <= 0
          ? "Perfect — an optimal cross, eyes closed."
          : `Cross solved blind in ${moves.length} turns (optimal ${optimal}).`;
    detail =
      level === "cross" && extra > 0 && wanderedAt !== null
        ? `The first ${onPlan} turns were optimal; turn ${wanderedAt + 1} (${moves[wanderedAt]}) added the detour.`
        : level === "cross"
          ? "Every turn took the cross one step closer."
          : `${moves.length} turns.`;
  } else if (wrong.length === 0) {
    verdict = "Cross is right — but no F2L pair went in with it.";
    detail = "For an x-cross, one pair has to be solved together with the cross.";
  } else {
    const flipped = wrong.filter((e) => e.status === "flipped").map((e) => e.name);
    const misplaced = wrong.filter((e) => e.status === "misplaced").map((e) => e.name);
    const parts = [
      flipped.length ? `${flipped.join(", ")} flipped` : "",
      misplaced.length ? `${misplaced.join(", ")} in the wrong spot` : "",
    ].filter(Boolean);
    verdict = `${wrong.length} cross edge${wrong.length === 1 ? "" : "s"} off: ${parts.join("; ")}.`;
    detail =
      wanderedAt === null
        ? moves.length === 0
          ? "No turns made."
          : `Every turn was on an optimal path — the plan just stopped ${trail[trail.length - 1]} turn${trail[trail.length - 1] === 1 ? "" : "s"} short.`
        : `Your first ${onPlan} turn${onPlan === 1 ? " was" : "s were"} optimal; turn ${wanderedAt + 1} (${moves[wanderedAt]}) is where the plan in your head and the cube parted ways.`;
  }

  return {
    level,
    success,
    moves,
    turns: moves.length,
    optimal,
    trail,
    onPlan,
    wanderedAt,
    edges,
    pair: pairIndex !== null ? PAIR_LABELS[pairIndex] : null,
    verdict,
    detail,
  };
}

export interface BlindAttempt {
  date: number;
  level: BlindLevel;
  success: boolean;
  turns: number;
  optimal: number;
  inspectMs: number;
}

export interface BlindSummary {
  attempts: number;
  successRate: number;
  /** Consecutive successes, most recent first. */
  streak: number;
  bestStreak: number;
  /** Mean turns over optimal on successful cross attempts. */
  avgExtra: number | null;
  /** Success rate over the last 10 (for a "ready to level up" nudge). */
  recentRate: number;
}

export function summarizeBlind(attempts: readonly BlindAttempt[], level: BlindLevel): BlindSummary | null {
  const list = attempts.filter((a) => a.level === level).sort((a, b) => a.date - b.date);
  if (list.length === 0) return null;
  let streak = 0;
  for (let i = list.length - 1; i >= 0 && list[i].success; i--) streak++;
  let bestStreak = 0;
  let run = 0;
  for (const a of list) {
    run = a.success ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  const wins = list.filter((a) => a.success);
  const recent = list.slice(-10);
  return {
    attempts: list.length,
    successRate: wins.length / list.length,
    streak,
    bestStreak,
    avgExtra: wins.length && level === "cross" ? wins.reduce((s, a) => s + (a.turns - a.optimal), 0) / wins.length : null,
    recentRate: recent.filter((a) => a.success).length / recent.length,
  };
}
