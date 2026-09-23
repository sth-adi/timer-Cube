import { newCube } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { simplify } from "@/lib/smartcube/route";
import { milestoneTimes } from "@/lib/pacer/pacer";
import type { Solve } from "@/types";

/**
 * One row per smart-cube solve: everything the history analytics (the
 * Autopsy, Consistency Lab, Progress Forecast, Warm-up & Fatigue, Sum of
 * Best, Luck Meter, Solve Archetypes and the Stall Map) slice and compare,
 * computed once from the stored reconstruction and its per-move timestamps.
 *
 * Metrics split into two families on purpose. **Skill** metrics are things
 * you do: how long each phase took, how much you paused, how fast you
 * turned. **Luck** metrics are things the scramble did to you: how long the
 * cross had to be, pairs it solved for free, skipped OLLs and PLLs. Telling
 * them apart is the whole point of asking "why was that solve slow?".
 */

import { PAUSE_MS } from "./pause";

export { PAUSE_MS };

export const PHASES = ["Cross", "F2L", "OLL", "PLL"] as const;
export type PhaseName = (typeof PHASES)[number];

/** The seven stretches of a CFOP solve, between consecutive milestones. */
export const SEGMENTS = ["Cross", "Pair 1", "Pair 2", "Pair 3", "Pair 4", "OLL", "PLL"] as const;

export interface SolveMetrics {
  id: string;
  date: number;
  totalMs: number;
  /** Time in each phase (ms), in PHASES order. */
  phases: [number, number, number, number];
  /** Finer stretches (ms), in SEGMENTS order: cross, each pair, OLL, PLL. */
  segments: number[];
  /** Ms from start at which each phase ended (Cross, F2L, OLL, solved). */
  phaseEnds: [number, number, number, number];
  /** Every pause: when it started (ms from start) and how long it was. */
  pauses: { atMs: number; ms: number }[];
  turns: number;
  /** Turns per second over the whole solve. */
  tps: number;
  /** Turns per second counting only the gaps shorter than a pause — how fast your hands are. */
  execTps: number;
  pauseMs: number;
  pauseCount: number;
  longestPauseMs: number;
  /** Pausing inside F2L alone (between the cross and the last pair). */
  f2lPauseMs: number;
  rotations: number | null;
  // Luck
  crossOptimal: number;
  freePairs: number;
  ollSkip: boolean;
  pllSkip: boolean;
}

/** The solves the analytics can use: smart-cube captures with a full reconstruction and timestamps, not DNF. */
export function analyzableSolves(solves: readonly Solve[]): Solve[] {
  return solves
    .filter((s) => s.penalty !== "dnf" && s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
    .sort((a, b) => a.date - b.date);
}

/** Metrics for one solve, or null when the solve can't be split into all four phases. */
export function solveMetrics(solve: Solve): SolveMetrics | null {
  const moves = solve.reconstruction!.split(/\s+/).filter(Boolean);
  const timesMs = solve.moveTimestamps!;
  if (moves.length !== timesMs.length || moves.length < 10) return null;
  const m = milestoneTimes({ scramble: solve.scramble, moves, timesMs });
  if (m[0] === null || m[4] === null || m[5] === null || m[6] === null) return null;
  const end = solve.timeMs;
  const phases: [number, number, number, number] = [m[0], m[4] - m[0], m[5] - m[4], Math.max(0, end - m[5])];

  const pauses: { atMs: number; ms: number }[] = [];
  let pauseMs = 0;
  let pauseCount = 0;
  let longestPauseMs = 0;
  let f2lPauseMs = 0;
  let execMs = 0;
  let execGaps = 0;
  for (let i = 1; i < timesMs.length; i++) {
    const gap = timesMs[i] - timesMs[i - 1];
    if (gap >= PAUSE_MS) {
      pauses.push({ atMs: timesMs[i - 1], ms: gap });
      pauseMs += gap;
      pauseCount++;
      longestPauseMs = Math.max(longestPauseMs, gap);
      if (timesMs[i - 1] >= m[0] && timesMs[i] <= m[4]) f2lPauseMs += gap;
    } else {
      execMs += gap;
      execGaps++;
    }
  }

  const start = newCube();
  start.move(solve.scramble);
  const turns = simplify(moves).length;
  const between = (from: number, to: number) => moves.filter((_, i) => timesMs[i] > from && timesMs[i] <= to);
  const onlyAuf = (ms: string[]) => ms.every((t) => t[0] === "D");

  return {
    id: solve.id,
    date: solve.date,
    totalMs: end,
    phases,
    segments: [m[0], m[1]! - m[0], m[2]! - m[1]!, m[3]! - m[2]!, m[4] - m[3]!, m[5] - m[4], Math.max(0, end - m[5])],
    phaseEnds: [m[0], m[4], m[5], end],
    pauses,
    turns,
    tps: turns / Math.max(0.001, end / 1000),
    execTps: execGaps > 0 ? execGaps / Math.max(0.001, execMs / 1000) : 0,
    pauseMs,
    pauseCount,
    longestPauseMs,
    f2lPauseMs,
    rotations: solve.rotations ? solve.rotations.length : null,
    crossOptimal: crossHeuristic(start),
    freePairs: [0, 1, 2, 3].filter((i) => f2lPairSolved(start, i as 0 | 1 | 2 | 3)).length,
    ollSkip: onlyAuf(between(m[4], m[5])),
    pllSkip: onlyAuf(between(m[5], m[6])),
  };
}

export function metricsFor(solves: readonly Solve[]): SolveMetrics[] {
  return analyzableSolves(solves)
    .map(solveMetrics)
    .filter((x): x is SolveMetrics => x !== null);
}

// ── small statistics toolkit ────────────────────────────────────────────

export const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function covariance(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mx = avg(xs);
  const my = avg(ys);
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.length - 1);
}

/** Linear-interpolated quantile (q in 0..1) of unsorted values. */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Least-squares line y = a + b·x, with the slope's standard error. */
export function fitLine(xs: readonly number[], ys: readonly number[]): { a: number; b: number; seB: number } {
  const n = xs.length;
  const mx = avg(xs);
  const my = avg(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = sxx > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const a = my - b * mx;
  const rss = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0);
  const seB = n > 2 && sxx > 0 ? Math.sqrt(rss / (n - 2) / sxx) : Infinity;
  return { a, b, seB };
}

export const secs = (ms: number | null, digits = 2) => (ms === null || !Number.isFinite(ms) ? "—" : `${(ms / 1000).toFixed(digits)}s`);
