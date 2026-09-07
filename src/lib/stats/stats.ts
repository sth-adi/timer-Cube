import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";

export interface AverageResult {
  /** ms, or null if DNF (too many DNFs in the window) or not enough solves yet. */
  value: number | null;
  isDnf: boolean;
}

/**
 * WCA-style average of N: drop the best and worst 1 result (for N>=5), mean
 * the rest. If more than 1 DNF is in the window, or N=1..2 has any DNF, the
 * average itself is DNF. For N<5 there's no trimming (plain mean), matching
 * how most community timers define ao3.
 */
export function averageOfN(times: number[]): AverageResult {
  const n = times.length;
  if (n === 0) return { value: null, isDnf: false };

  if (n < 5) {
    const dnfCount = times.filter((t) => t === Infinity).length;
    if (dnfCount > 0) return { value: null, isDnf: true };
    const mean = times.reduce((a, b) => a + b, 0) / n;
    return { value: mean, isDnf: false };
  }

  const dnfCount = times.filter((t) => t === Infinity).length;
  if (dnfCount >= 2) return { value: null, isDnf: true };

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  if (trimmed.some((t) => t === Infinity)) return { value: null, isDnf: true };
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return { value: mean, isDnf: false };
}

/** Maps a solve to its comparable time: DNF -> Infinity, else final (with +2) ms. */
export function comparableTime(solve: Solve): number {
  const final = solveFinalMs(solve);
  return final === null ? Infinity : final;
}

/**
 * Rolling average-of-N ending at each solve (chronological order in, same
 * length out). Entry i is null until at least N solves have occurred.
 */
export function rollingAverages(solves: Solve[], n: number): (number | null)[] {
  const times = solves.map(comparableTime);
  const result: (number | null)[] = [];
  for (let i = 0; i < times.length; i++) {
    if (i + 1 < n) {
      result.push(null);
      continue;
    }
    const window = times.slice(i + 1 - n, i + 1);
    result.push(averageOfN(window).value);
  }
  return result;
}

/** Best rolling average-of-N across the whole session (the "best aoN" stat). */
export function bestAverageOfN(solves: Solve[], n: number): number | null {
  const rolling = rollingAverages(solves, n);
  const valid = rolling.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

export interface SessionStats {
  count: number;
  solveCount: number;
  dnfCount: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  ao5: number | null;
  ao12: number | null;
  ao50: number | null;
  ao100: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  stdDev: number | null;
}

export function computeSessionStats(solves: Solve[]): SessionStats {
  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const dnfCount = times.length - finite.length;

  const best = finite.length > 0 ? Math.min(...finite) : null;
  const worst = finite.length > 0 ? Math.max(...finite) : null;
  const mean = finite.length > 0 ? finite.reduce((a, b) => a + b, 0) / finite.length : null;

  let stdDev: number | null = null;
  if (finite.length > 1 && mean !== null) {
    const variance = finite.reduce((sum, t) => sum + (t - mean) ** 2, 0) / (finite.length - 1);
    stdDev = Math.sqrt(variance);
  }

  const last = (n: number) => averageOfN(times.slice(-n)).value;

  return {
    count: solves.length,
    solveCount: finite.length,
    dnfCount,
    best,
    worst,
    mean,
    ao5: times.length >= 5 ? last(5) : null,
    ao12: times.length >= 12 ? last(12) : null,
    ao50: times.length >= 50 ? last(50) : null,
    ao100: times.length >= 100 ? last(100) : null,
    bestAo5: bestAverageOfN(solves, 5),
    bestAo12: bestAverageOfN(solves, 12),
    stdDev,
  };
}
