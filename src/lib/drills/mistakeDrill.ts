import { Cube, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { BREAK_MIN_MOVES, LOOK_PAUSE_MS, analyzeMistakes, type Mistake, type MistakePhase } from "@/lib/analysis/mistakeRadar";
import { crossSolved } from "@/lib/xray/common";
import type { Solve } from "@/types";
import type { NavStep } from "@/lib/satnav/planner";
import { crossFaceOf, toCrossFrame, type CrossFace } from "@/lib/smartcube/crossFrame";

/**
 * Mistake Drills: every costly moment the Mistake Radar found, rebuilt on
 * your cube so you can do it again properly. A drill starts from the exact
 * position before the mistake (or, for an extra look, the start of that
 * step), and ends when the step it happened in is done. Each retry is
 * graded against the original, against the Sat-Nav's route, and on whether
 * the same mistake happened again.
 */

export interface Drill {
  id: string;
  solveId: string;
  date: number;
  mistake: Mistake;
  /** Moves from solved to the drill's start position (the solve's scramble plus its moves up to there), in the cube's real colours — what gets set up on your cube. */
  setup: string;
  /** The colour the solve's cross was on; checks run with it relabelled to white (see crossFrame.ts). */
  frame: CrossFace;
  /** What finishing the drill means. */
  goal: MistakePhase;
  /** How the original solve got from the start position to the goal. */
  original: { turns: number; ms: number };
}

export function goalReached(cube: CubeJSInstance, goal: MistakePhase): boolean {
  if (goal === "Cross") return crossSolved(cube);
  if (goal === "F2L") return bottomLayerSolved(cube);
  if (goal === "OLL") return bottomLayerSolved(cube) && orientationSolved(cube);
  return cube.isSolved();
}

/** The costliest mistakes across your recent smart-cube solves, as drills. */
export function collectDrills(solves: readonly Solve[], limit = 12): Drill[] {
  const drills: Drill[] = [];
  for (const s of solves) {
    if (!s.scramble || !s.reconstruction || !s.moveTimestamps?.length || s.penalty === "dnf") continue;
    const physical = s.reconstruction.split(/\s+/).filter(Boolean);
    const frame = crossFaceOf(s.scramble, physical) ?? "U";
    const scramble = toCrossFrame(s.scramble.split(/\s+/).filter(Boolean), frame).join(" ");
    const moves = toCrossFrame(physical, frame);
    const times = s.moveTimestamps;
    const report = analyzeMistakes({ scramble, moves, timesMs: times, totalMs: s.timeMs });
    if (!report.mistakes.length) continue;

    // States after each move, to find step boundaries and where the goal was reached.
    const cube = newCube();
    cube.move(scramble);
    const after: CubeJSInstance[] = [];
    for (const m of moves) {
      cube.move(m);
      after.push(cube.clone());
    }
    const f2lIdx = after.findIndex((c) => bottomLayerSolved(c));
    const ollIdx = f2lIdx < 0 ? -1 : after.findIndex((c, i) => i >= f2lIdx && bottomLayerSolved(c) && orientationSolved(c));

    for (const m of report.mistakes) {
      const goal: MistakePhase = m.kind === "pair-knocked" ? "F2L" : m.kind === "cross-broken" ? "F2L" : m.phase;
      const start = m.kind === "extra-oll-look" ? f2lIdx + 1 : m.kind === "extra-pll-look" ? ollIdx + 1 : m.moveIndex;
      if (start <= 0 || start > moves.length) continue;
      const end = after.findIndex((c, i) => i >= start && goalReached(c, goal));
      if (end < 0) continue;
      drills.push({
        id: `${s.id}:${m.kind}:${m.moveIndex}`,
        solveId: s.id,
        date: s.date,
        mistake: m,
        setup: [s.scramble, ...physical.slice(0, start)].join(" "),
        frame,
        goal,
        // Timed from the first turn after the start, the way retries are.
        original: { turns: end + 1 - start, ms: (times[end] ?? 0) - (times[start] ?? 0) },
      });
    }
  }
  return drills.sort((a, b) => b.mistake.costMs - a.mistake.costMs).slice(0, limit);
}

export interface DrillAttempt {
  moves: readonly string[];
  /** Ms from the attempt's first turn. */
  timesMs: readonly number[];
}

export interface DrillGrade {
  turns: number;
  ms: number;
  /** Your turns/time minus the original's (negative = better). */
  vsOriginalTurns: number;
  vsOriginalMs: number;
  vsRouteTurns: number | null;
  repeated: boolean;
  verdict: string;
}

/** The drill's start position plus `moves`, in the analysis frame (cross on white). */
export function drillCube(drill: Pick<Drill, "setup" | "frame">, moves: readonly string[] = []): CubeJSInstance {
  const cube = newCube();
  const tokens = toCrossFrame([...drill.setup.split(/\s+/).filter(Boolean), ...moves], drill.frame ?? "U");
  if (tokens.length) cube.move(tokens.join(" "));
  return cube;
}

/** Whether the attempt so far has reached the drill's goal. */
export function drillDone(drill: Drill, moves: readonly string[]): boolean {
  return goalReached(drillCube(drill, moves), drill.goal);
}

/** Did the attempt make the same kind of mistake again? Judged the way the Radar judges a real solve. */
export function repeatedMistake(drill: Drill, attempt: DrillAttempt): boolean {
  const kind = drill.mistake.kind;
  if (kind === "extra-oll-look" || kind === "extra-pll-look") {
    return attempt.timesMs.slice(1).some((t, i) => t - attempt.timesMs[i] >= LOOK_PAUSE_MS);
  }
  if (kind === "wasted-turns") return attempt.moves.length >= drill.original.turns;
  // Knocked pair / broken cross: something solved at the start stayed broken for a while.
  const cube = drillCube(drill);
  const frame = drill.frame ?? "U";
  const solvedAtStart = (c: CubeJSInstance) => [crossSolved(c), ...[0, 1, 2, 3].map((p) => f2lPairSolved(c, p as 0 | 1 | 2 | 3))];
  const initially = solvedAtStart(cube);
  const brokenFor = initially.map(() => 0);
  for (const m of toCrossFrame(attempt.moves, frame)) {
    cube.move(m);
    if (goalReached(cube, drill.goal)) return false;
    const now = solvedAtStart(cube);
    for (let k = 0; k < now.length; k++) {
      brokenFor[k] = initially[k] && !now[k] ? brokenFor[k] + 1 : 0;
      if (brokenFor[k] >= BREAK_MIN_MOVES) return true;
    }
  }
  return false;
}

const s2 = (ms: number) => (Math.abs(ms) / 1000).toFixed(2);

export function gradeAttempt(drill: Drill, attempt: DrillAttempt, routeTurns: number | null): DrillGrade {
  const turns = attempt.moves.length;
  const ms = attempt.timesMs[attempt.timesMs.length - 1] ?? 0;
  const repeated = repeatedMistake(drill, attempt);
  const vsOriginalMs = ms - drill.original.ms;
  const vsOriginalTurns = turns - drill.original.turns;
  const time = vsOriginalMs < 0 ? `${s2(vsOriginalMs)}s faster than the original` : `${s2(vsOriginalMs)}s slower than the original`;
  const route = routeTurns !== null ? ` The Sat-Nav's route was ${routeTurns} turn${routeTurns === 1 ? "" : "s"}; you took ${turns}.` : "";
  const verdict = repeated
    ? `Same mistake again — ${time}.${route} Slow down through this spot and try it once more.`
    : `Clean — no ${drill.mistake.kind === "extra-oll-look" || drill.mistake.kind === "extra-pll-look" ? "second look" : "repeat of the mistake"}, ${time}.${route}`;
  return { turns, ms, vsOriginalTurns, vsOriginalMs, vsRouteTurns: routeTurns === null ? null : turns - routeTurns, repeated, verdict };
}

export interface RouteLeg {
  title: string;
  display: string[];
  turns: number;
}

/** The Sat-Nav's legs from `facelets` until the drill's goal is reached. */
export async function routeToGoal(facelets: string, goal: MistakePhase, plan: (f: string) => Promise<NavStep> | NavStep, maxLegs = 10): Promise<RouteLeg[] | null> {
  const cube = Cube.fromString(facelets);
  const legs: RouteLeg[] = [];
  for (let i = 0; i < maxLegs; i++) {
    if (goalReached(cube, goal)) return legs;
    const step = await plan(cube.asString());
    if (step.stage === "lost" || step.stage === "solved" || !step.turns.length) return null;
    legs.push({ title: step.title, display: step.display, turns: step.turns.length });
    cube.move(step.turns.join(" "));
  }
  return goalReached(cube, goal) ? legs : null;
}
