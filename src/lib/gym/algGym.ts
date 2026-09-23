import { Cube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { OLL_CASES } from "@/lib/algorithms/ollData";
import { PLL_CASES } from "@/lib/algorithms/pllData";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { invertMoves } from "@/lib/xray/common";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { identifyAlg } from "@/lib/smartcube/algId";

/**
 * Alg Gym: OLL/PLL drilling on a real cube. The app sets a case up on the
 * cube itself (as a route of turns it checks you through), then times your
 * recognition and execution off the move stream, knows the instant the case
 * is done — and if it isn't, can tell *which* algorithm you actually did.
 */

export type GymGroup = "OLL" | "PLL";

export interface GymCase {
  group: GymGroup;
  name: string;
  alg: string;
}

export const GYM_CASES: readonly GymCase[] = [
  ...PLL_CASES.map((c) => ({ group: "PLL" as const, name: c.name, alg: c.alg })),
  ...OLL_CASES.map((c) => ({ group: "OLL" as const, name: c.name, alg: c.alg })),
];

export const caseKey = (c: { group: GymGroup; name: string }) => `${c.group}:${c.name}`;

const AUF = ["", "D", "D2", "D'"];

/**
 * A setup for the case, as engine-frame turns from solved: the book alg
 * undone (so the cube is exactly in that case), with a random AUF before
 * and after so the case never shows up the same way round twice.
 */
export function setupSequence(c: GymCase, rand: () => number = Math.random): string {
  const pre = AUF[Math.floor(rand() * 4)];
  const post = AUF[Math.floor(rand() * 4)];
  const undo = invertMoves(toPhysicalTurns(c.alg, HOME_ORIENTATION).turns);
  return [pre, ...undo, post].filter(Boolean).join(" ");
}

/** Whether the cube is through the step: F2L intact and the last layer oriented (OLL) or solved up to an AUF (PLL). */
export function stepDone(group: GymGroup, cube: CubeJSInstance): boolean {
  if (!bottomLayerSolved(cube)) return false;
  if (group === "OLL") return orientationSolved(cube);
  return AUF.some((a) => {
    const c = cube.clone();
    if (a) c.move(a);
    return c.isSolved();
  });
}

export function stepDoneFacelets(group: GymGroup, facelets: string): boolean {
  return stepDone(group, Cube.fromString(facelets));
}

/**
 * When an attempt doesn't finish the case, what the executed turns really
 * were: another case's algorithm (the classic Sune/Antisune mix-up), or
 * not a last-layer algorithm at all.
 */
export function explainMiss(target: GymCase, executed: readonly string[]): string {
  if (executed.length === 0) return "No turns made.";
  const id = identifyAlg(executed);
  if ((id.kind === "oll" || id.kind === "pll") && id.caseName && id.caseName !== target.name) {
    return `That was the ${id.caseName} algorithm — this case is ${target.name}.`;
  }
  if (id.kind === "auf") return "Only the top layer turned.";
  if (id.kind === "other") return "That broke F2L — the algorithm went off track partway.";
  return `Not quite ${target.name} — check the algorithm.`;
}

export interface GymCaseStats {
  attempts: number;
  successes: number;
  bestMs: number | null;
  /** Last few successful execution times (ms). */
  recentMs: number[];
  /** Last few recognition times (ms). */
  recentRecogMs: number[];
}

export function emptyStats(): GymCaseStats {
  return { attempts: 0, successes: 0, bestMs: null, recentMs: [], recentRecogMs: [] };
}

export function recordAttempt(prev: GymCaseStats | undefined, ok: boolean, execMs: number, recogMs: number): GymCaseStats {
  const s = prev ?? emptyStats();
  return {
    attempts: s.attempts + 1,
    successes: s.successes + (ok ? 1 : 0),
    bestMs: ok ? Math.min(s.bestMs ?? Infinity, execMs) : s.bestMs,
    recentMs: ok ? [...s.recentMs, execMs].slice(-5) : s.recentMs,
    recentRecogMs: [...s.recentRecogMs, recogMs].slice(-5),
  };
}

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function caseAverageMs(s: GymCaseStats | undefined): number | null {
  if (!s) return null;
  const e = avg(s.recentMs);
  const r = avg(s.recentRecogMs);
  return e === null ? null : e + (r ?? 0);
}

/**
 * Picks the next case to drill, weighted toward what needs work: cases
 * never tried, cases you've missed, and cases slower than your average all
 * come up more often. Never repeats the case just drilled.
 */
export function pickNextCase(
  pool: readonly GymCase[],
  stats: Record<string, GymCaseStats>,
  previous: string | null,
  rand: () => number = Math.random,
): GymCase {
  const candidates = pool.filter((c) => caseKey(c) !== previous);
  const list = candidates.length ? candidates : pool;
  const known = list.map((c) => caseAverageMs(stats[caseKey(c)])).filter((v): v is number => v !== null);
  const overall = avg(known) ?? 1;
  const weights = list.map((c) => {
    const s = stats[caseKey(c)];
    if (!s || s.attempts === 0) return 3;
    const misses = s.attempts - s.successes;
    const pace = (caseAverageMs(s) ?? overall) / overall;
    return 1 + misses * 1.5 + Math.max(0, pace - 1) * 4;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}
