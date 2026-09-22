import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { comparableTime, normalSolves } from "./stats";

/**
 * One solve, positioned in a 3-axis space for the "Solve Constellation" star
 * map. Every axis is derived straight from data already computed elsewhere
 * in the stats layer (comparableTime, running mean/stdDev) — nothing here is
 * a new scoring formula, just a spatial layout of existing numbers:
 *
 * - `x` (left-right): raw speed, normalized against this set's own
 *   fastest/slowest solve. +1 is the fastest solve in the set, -1 the
 *   slowest.
 * - `y` (up-down): how much of an outlier this solve was against the
 *   *running* mean/stdDev at the time it happened (a z-score, soft-clamped
 *   with tanh) — a solve that badly broke from your usual pace floats high
 *   above the plane; a rough one sinks below it. Deliberately "at the time,"
 *   not against the final overall mean, so early solves in a session aren't
 *   judged against improvement that hadn't happened yet.
 * - `z` (near-far): chronological order, oldest at the back, most recent at
 *   the front — the star map doubles as a timeline you fly through.
 *
 * DNFs are excluded outright (a DNF has no time to position on a speed
 * axis), same choke point as everywhere else that plots real solve times.
 */
export interface ConstellationStar {
  solve: Solve;
  finalMs: number;
  x: number;
  y: number;
  z: number;
  /** True if this was a new best-single at the moment it happened, chronologically. */
  isPB: boolean;
}

function clampTanh(v: number): number {
  return Math.tanh(v);
}

/** Builds the star field from a solve list — call with `normalSolves(allSolves)` for the usual "don't mix in OH/feet/BLD" filtering, already applied here as a convenience since a constellation is inherently a whole-history view. */
export function buildConstellation(solves: readonly Solve[]): ConstellationStar[] {
  const chronological = normalSolves([...solves]).sort((a, b) => a.date - b.date);
  const finite = chronological
    .map((solve) => ({ solve, finalMs: solveFinalMs(solve) }))
    .filter((s): s is { solve: Solve; finalMs: number } => s.finalMs !== null);

  if (finite.length === 0) return [];

  const allMs = finite.map((s) => s.finalMs);
  const min = Math.min(...allMs);
  const max = Math.max(...allMs);
  const speedRange = max - min;

  const n = finite.length;
  let runningBest = Infinity;
  let runningSum = 0;
  let runningSumSq = 0;

  return finite.map(({ solve, finalMs }, i) => {
    // Running mean/stdDev over every solve up to and including this one —
    // "at the time" framing from the doc comment above.
    runningSum += finalMs;
    runningSumSq += finalMs * finalMs;
    const count = i + 1;
    const runningMean = runningSum / count;
    const runningVariance = count > 1 ? Math.max(0, runningSumSq / count - runningMean * runningMean) : 0;
    const runningStdDev = Math.sqrt(runningVariance);

    const isPB = comparableTime(solve) < runningBest;
    if (isPB) runningBest = comparableTime(solve);

    const x = speedRange > 0 ? clampTanh(((2 * (max - finalMs)) / speedRange - 1) * 1.5) : 0;
    const y = runningStdDev > 0 ? clampTanh((runningMean - finalMs) / runningStdDev) : 0;
    const z = n > 1 ? (2 * i) / (n - 1) - 1 : 0;

    return { solve, finalMs, x, y, z, isPB };
  });
}
