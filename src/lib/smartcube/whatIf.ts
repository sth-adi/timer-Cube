import { Cube, newCube } from "@/lib/cube-engine/engine";
import type { NavStep } from "@/lib/satnav/planner";

/**
 * Time Machine "what if": fork a saved solve at any turn, play different
 * turns from there, and have the Sat-Nav finish the solve from wherever
 * the branch leaves the cube — so "what if I'd taken the other pair?" gets
 * an actual answer in turns, and an estimate in seconds at your own pace.
 * Everything is physical (center-color) turns, like the saved solve.
 */

/** Facelets after the first `at` turns of the solve. */
export function stateAt(scramble: string, moves: readonly string[], at: number): string {
  const c = newCube();
  if (scramble.trim()) c.move(scramble);
  const upto = moves.slice(0, at);
  if (upto.length) c.move(upto.join(" "));
  return c.asString();
}

export function applyTurns(facelets: string, turns: readonly string[]): string {
  if (!turns.length) return facelets;
  const c = Cube.fromString(facelets);
  c.move(turns.join(" "));
  return c.asString();
}

export interface Remainder {
  turns: number;
  ms: number;
}

/** What actually happened after the fork: turns left and time left. */
export function originalRemainder(timesMs: readonly number[], totalMs: number, at: number): Remainder {
  const forkMs = at === 0 ? 0 : (timesMs[at - 1] ?? 0);
  return { turns: timesMs.length - at, ms: Math.max(0, totalMs - forkMs) };
}

/**
 * Your pace for the part of the solve after the fork, pauses included —
 * the fairest price for a branch that replaces it. Falls back to the
 * whole solve's pace when too little is left to measure.
 */
export function msPerTurnAfter(timesMs: readonly number[], totalMs: number, at: number): number {
  const rest = originalRemainder(timesMs, totalMs, at);
  if (rest.turns >= 8) return rest.ms / rest.turns;
  return timesMs.length ? totalMs / timesMs.length : 0;
}

export interface Leg {
  title: string;
  stage: NavStep["stage"];
  turns: string[];
  display: string[];
}

export interface Completion {
  legs: Leg[];
  turns: number;
  solved: boolean;
}

/** Plans leg after leg with the Sat-Nav from `facelets` until the cube is solved (or the planner gives up). */
export async function completeFrom(facelets: string, plan: (f: string) => Promise<NavStep> | NavStep, maxLegs = 12): Promise<Completion> {
  const legs: Leg[] = [];
  let f = facelets;
  for (let i = 0; i < maxLegs; i++) {
    const step = await plan(f);
    if (step.stage === "solved") return { legs, turns: legs.reduce((a, l) => a + l.turns.length, 0), solved: true };
    if (step.stage === "lost" || step.turns.length === 0) break;
    legs.push({ title: step.title, stage: step.stage, turns: step.turns, display: step.display });
    f = applyTurns(f, step.turns);
  }
  return { legs, turns: legs.reduce((a, l) => a + l.turns.length, 0), solved: Cube.fromString(f).isSolved() };
}

export interface BranchVerdict {
  /** Branch turns (yours + the Sat-Nav's finish) minus what you actually did from the fork. */
  turnDelta: number;
  /** The same, in ms at your own after-fork pace. */
  msDelta: number;
  line: string;
}

export function verdict(original: Remainder, branchTurns: number, msPerTurn: number): BranchVerdict {
  const turnDelta = branchTurns - original.turns;
  const msDelta = turnDelta * msPerTurn;
  const secs = Math.abs(msDelta / 1000).toFixed(2);
  const line =
    turnDelta === 0
      ? "Same length as what you did."
      : turnDelta < 0
        ? `${-turnDelta} turn${turnDelta === -1 ? "" : "s"} shorter — about ${secs}s faster at your pace.`
        : `${turnDelta} turn${turnDelta === 1 ? "" : "s"} longer — about ${secs}s slower at your pace.`;
  return { turnDelta, msDelta, line };
}
