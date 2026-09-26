import type { Penalty } from "@/types";

/**
 * Comp Sim: a WCA-style round, run the way a competition runs it — a fixed
 * set of scrambles, inspection with a judge's 8s/12s calls, a cutoff after
 * the first attempts, a per-attempt time limit, and the official average
 * rules (Ao5 drops best and worst, one DNF can be dropped, two can't).
 */

export type RoundKind = "ao5" | "mo3";

export interface RoundFormat {
  kind: RoundKind;
  /** Beat this in the first attempts (2 for Ao5, 1 for Mo3) to continue; null = no cutoff. */
  cutoffMs: number | null;
  /** An attempt past this is stopped and counts as DNF; null = no limit. */
  timeLimitMs: number | null;
}

export interface Attempt {
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  /** Average heart rate during the attempt, when a monitor was connected. */
  bpm?: number;
}

export const ATTEMPTS: Record<RoundKind, number> = { ao5: 5, mo3: 3 };
const CUTOFF_ATTEMPTS: Record<RoundKind, number> = { ao5: 2, mo3: 1 };

/** The attempt as it counts: +2 added, DNF (or over the time limit) as null. */
export function attemptResult(a: Pick<Attempt, "timeMs" | "penalty">, format?: Pick<RoundFormat, "timeLimitMs">): number | null {
  if (a.penalty === "dnf") return null;
  const t = a.penalty === "plus2" ? a.timeMs + 2000 : a.timeMs;
  if (format?.timeLimitMs != null && t >= format.timeLimitMs) return null;
  return t;
}

/** WCA rounds averages to the nearest hundredth (singles are truncated). */
const roundAverage = (ms: number) => Math.round(ms / 10) * 10;

/** The round's average by WCA rules, or null (DNF) — undefined while it can't be computed yet. */
export function wcaAverage(results: readonly (number | null)[], kind: RoundKind): number | null | undefined {
  if (results.length < ATTEMPTS[kind]) return undefined;
  const r = results.slice(0, ATTEMPTS[kind]);
  if (kind === "mo3") return r.some((x) => x === null) ? null : roundAverage((r as number[]).reduce((a, b) => a + b, 0) / 3);
  const sorted = [...r].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  const counting = sorted.slice(1, 4);
  if (counting.some((x) => x === null)) return null;
  return roundAverage((counting as number[]).reduce((a, b) => a + b, 0) / 3);
}

export interface RoundProgress {
  /** Attempts done so far. */
  done: number;
  /** How many attempts this round will have in total (fewer if the cutoff was missed). */
  total: number;
  finished: boolean;
  missedCutoff: boolean;
}

export function roundProgress(format: RoundFormat, results: readonly (number | null)[]): RoundProgress {
  const full = ATTEMPTS[format.kind];
  const cut = CUTOFF_ATTEMPTS[format.kind];
  const missedCutoff =
    format.cutoffMs !== null && results.length >= cut && results.slice(0, cut).every((x) => x === null || x >= format.cutoffMs!);
  const total = missedCutoff ? cut : full;
  return { done: results.length, total, finished: results.length >= total, missedCutoff };
}

export interface RoundSummary {
  average: number | null | undefined;
  best: number | null;
  /** Round average minus your practice average (positive = the round was slower). */
  compTaxMs: number | null;
  headline: string;
}

const s2 = (ms: number) => (ms / 1000).toFixed(2);

export function summarizeRound(format: RoundFormat, results: readonly (number | null)[], practiceAvgMs: number | null): RoundSummary {
  const prog = roundProgress(format, results);
  const finite = results.filter((x): x is number => x !== null);
  const best = finite.length ? Math.min(...finite) : null;
  const average = prog.missedCutoff ? undefined : wcaAverage(results, format.kind);
  const compTaxMs = typeof average === "number" && practiceAvgMs !== null ? average - practiceAvgMs : null;
  const label = format.kind === "ao5" ? "average" : "mean";
  const headline = prog.missedCutoff
    ? `Missed the ${s2(format.cutoffMs!)} cutoff${best !== null ? ` — best single ${s2(best)}` : ""}.`
    : average === null
      ? `DNF ${label}${best !== null ? ` — best single ${s2(best)}` : ""}.`
      : average === undefined
        ? "Round in progress."
        : compTaxMs === null
          ? `${s2(average)} ${label}.`
          : Math.abs(compTaxMs) < 50
            ? `${s2(average)} ${label} — exactly your practice level.`
            : compTaxMs > 0
              ? `${s2(average)} ${label} — ${s2(compTaxMs)} slower than your practice average. That's the comp tax to train away.`
              : `${s2(average)} ${label} — ${s2(-compTaxMs)} faster than practice. Pressure suits you.`;
  return { average, best, compTaxMs, headline };
}

/** What you'd need on the last attempt to reach a target average (Ao5 after four attempts). */
export function neededForTarget(results: readonly (number | null)[], targetMs: number): number | null | "impossible" | "locked" {
  if (results.length !== 4) return null;
  // Try the last attempt from very fast to very slow; the average is monotonic in it.
  const withLast = (t: number | null) => wcaAverage([...results, t], "ao5");
  const best = withLast(0);
  if (best == null || best > targetMs) return "impossible";
  const worst = withLast(null);
  if (worst != null && worst <= targetMs) return "locked";
  let lo = 0;
  let hi = 10 * 60_000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const avg = withLast(mid);
    if (avg != null && avg <= targetMs) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 10) * 10;
}
