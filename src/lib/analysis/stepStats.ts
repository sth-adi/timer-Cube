import { solveFinalMs, type Solve } from "@/types";
import { averageOfN } from "@/lib/stats/stats";
import { SITTING_GAP_MS } from "./momentum";
import { solveBreakdown } from "./solveBreakdown";

/**
 * The four CFOP steps across your smart-cube solves: for each, your mean,
 * best and current ao12; how much of it is looking (the pause before the
 * first turn of each step) against turning; and how your latest sitting
 * compares with the one before it — so a step getting better (or worse)
 * shows up the day it happens, not after a hundred solves.
 */

export const STEP_LABELS = ["Cross", "F2L", "OLL", "PLL"] as const;

export interface StepRecord {
  /** Cross, F2L, OLL, PLL: ms spent, and how much of that was looking before turning. */
  totalMs: [number, number, number, number];
  lookMs: [number, number, number, number];
}

/** A smart-cube solve's four step times (F2L is its four pairs together), or null without a breakdown. */
export function stepRecord(solve: Solve): StepRecord | null {
  const b = solveBreakdown(solve);
  if (!b) return null;
  const totalMs: StepRecord["totalMs"] = [0, 0, 0, 0];
  const lookMs: StepRecord["lookMs"] = [0, 0, 0, 0];
  const stepOf = (label: string, pair: number | null): 0 | 1 | 2 | 3 | null =>
    label === "Cross" ? 0 : pair !== null ? 1 : label === "OLL" ? 2 : label === "PLL" ? 3 : null;
  for (const r of b.rows) {
    const i = stepOf(r.label, r.f2lPairIndex);
    if (i === null) continue;
    totalMs[i] += r.totalMs ?? 0;
    lookMs[i] += r.recognitionMs ?? 0;
  }
  return { totalMs, lookMs };
}

export interface StepStat {
  label: (typeof STEP_LABELS)[number];
  meanMs: number;
  /** Fastest time at this step, skips aside. */
  bestMs: number;
  /** Your latest 12 at this step, best and worst dropped; null under 12 solves. */
  ao12Ms: number | null;
  /** Share of the whole solve. */
  share: number;
  /** Mean looking and turning time (they add up to meanMs). */
  lookMs: number;
  turnMs: number;
  /** This sitting's mean minus the last earlier sitting's with enough solves (negative is faster). */
  deltaMs: number | null;
}

export interface StepStatsReport {
  steps: StepStat[];
  sampleSize: number;
  meanTotalMs: number;
  /** Solves in the latest sitting and the one before it, when the comparison is shown. */
  sittings: { current: number; previous: number } | null;
}

/** Fewest solves a sitting needs before its step means are compared. */
export const MIN_SITTING_SOLVES = 3;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function stepStats(solves: readonly Solve[]): StepStatsReport | null {
  const rows = solves
    .filter((s) => s.penalty !== "dnf")
    .map((s) => ({ s, r: stepRecord(s) }))
    .filter((x): x is { s: Solve; r: StepRecord } => x.r !== null)
    .sort((a, b) => a.s.date - b.s.date);
  if (!rows.length) return null;

  // Sittings: runs of solves with no long break between them.
  const sittings: (typeof rows)[] = [];
  for (const x of rows) {
    const cur = sittings[sittings.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && x.s.date - x.s.timeMs - prev.s.date < SITTING_GAP_MS) cur.push(x);
    else sittings.push([x]);
  }
  const current = sittings[sittings.length - 1];
  // The last sitting before this one with enough solves to mean something (a lone solve on the bus doesn't count).
  const previous = sittings
    .slice(0, -1)
    .reverse()
    .find((g) => g.length >= MIN_SITTING_SOLVES);
  const compare = !!previous && current.length >= MIN_SITTING_SOLVES;

  const totals = rows.map((x) => x.r.totalMs.reduce((a, b) => a + b, 0));
  const meanTotalMs = mean(totals);
  const steps = STEP_LABELS.map((label, i) => {
    const times = rows.map((x) => x.r.totalMs[i]);
    const meanMs = mean(times);
    const lookMs = mean(rows.map((x) => x.r.lookMs[i]));
    return {
      label,
      meanMs,
      // A skip isn't a best — it's the fastest one you actually did.
      bestMs: Math.min(...(times.some((t) => t > 0) ? times.filter((t) => t > 0) : times)),
      ao12Ms: times.length >= 12 ? averageOfN(times.slice(-12)).value : null,
      share: meanTotalMs > 0 ? meanMs / meanTotalMs : 0,
      lookMs,
      turnMs: meanMs - lookMs,
      deltaMs: compare ? mean(current.map((x) => x.r.totalMs[i])) - mean(previous.map((x) => x.r.totalMs[i])) : null,
    };
  });
  return {
    steps,
    sampleSize: rows.length,
    meanTotalMs: mean(rows.map((x) => solveFinalMs(x.s) ?? x.s.timeMs)),
    sittings: compare ? { current: current.length, previous: previous.length } : null,
  };
}
