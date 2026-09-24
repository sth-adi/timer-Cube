import type { Solve } from "@/types";
import { PHASES, analyzableSolves, avg, metricsFor, type PhaseName } from "@/lib/analytics/solveMetrics";
import { analyzeMistakes } from "@/lib/analysis/mistakeRadar";

/**
 * Tilt Meter: poker players call it tilt — a mistake early doesn't just cost
 * its own time, it rattles what comes right after. This asks the same
 * question of a solve: when Mistake Radar flags a slip during Cross, F2L or
 * OLL, does the phase that follows run slower against your own average for
 * that phase — compared to when the phase before it was clean?
 *
 * Split into a pure aggregator (aggregateTilt) and the cube-touching glue
 * that builds its input (analyzeTilt), so the comparison logic is testable
 * without replaying a single move.
 */

const NEXT_PHASE: Partial<Record<PhaseName, PhaseName>> = { Cross: "F2L", F2L: "OLL", OLL: "PLL" };
const TRIGGER_PHASES = ["Cross", "F2L", "OLL"] as const;

export interface TiltEntry {
  hasMistake: boolean;
  /** This solve's next-phase time divided by the baseline (own-history) average for that phase. */
  ratio: number;
}

export interface TiltReport {
  afterMistakeAvgRatio: number;
  afterCleanAvgRatio: number;
  sampleSize: number;
  controlSize: number;
  tilts: boolean;
  headline: string;
}

export const MIN_SAMPLE = 12;
const TILT_THRESHOLD = 0.08;

const pct = (ratio: number) => `${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%`;

/** Pools per-transition ratio samples into the after-mistake vs after-clean comparison. */
export function aggregateTilt(entries: readonly TiltEntry[]): TiltReport | null {
  const afterMistake = entries.filter((e) => e.hasMistake).map((e) => e.ratio);
  const afterClean = entries.filter((e) => !e.hasMistake).map((e) => e.ratio);
  if (afterMistake.length < MIN_SAMPLE || afterClean.length < MIN_SAMPLE) return null;

  const afterMistakeAvgRatio = avg(afterMistake);
  const afterCleanAvgRatio = avg(afterClean);
  const tilts = afterMistakeAvgRatio - afterCleanAvgRatio >= TILT_THRESHOLD;

  const headline = tilts
    ? `The phase right after a flagged mistake runs ${pct(afterMistakeAvgRatio)} against your own average — versus ${pct(afterCleanAvgRatio)} after a clean phase. You tilt: a slip bleeds into what comes next.`
    : `The phase right after a flagged mistake runs ${pct(afterMistakeAvgRatio)} against your own average, barely different from ${pct(afterCleanAvgRatio)} after a clean phase — you recover cleanly and don't carry mistakes forward.`;

  return { afterMistakeAvgRatio, afterCleanAvgRatio, sampleSize: afterMistake.length, controlSize: afterClean.length, tilts, headline };
}

/** One ratio entry per triggering phase (Cross, F2L, OLL) that has a usable baseline. */
function entriesForSolve(mistakePhases: ReadonlySet<PhaseName>, phases: readonly [number, number, number, number], baseline: readonly number[]): TiltEntry[] {
  const out: TiltEntry[] = [];
  for (const phase of TRIGGER_PHASES) {
    const nextIdx = PHASES.indexOf(NEXT_PHASE[phase]!);
    const b = baseline[nextIdx];
    if (b <= 0) continue;
    out.push({ hasMistake: mistakePhases.has(phase), ratio: phases[nextIdx] / b });
  }
  return out;
}

export function analyzeTilt(solves: readonly Solve[]): TiltReport | null {
  const metrics = metricsFor(solves);
  if (metrics.length < MIN_SAMPLE) return null;
  const baseline = PHASES.map((_, i) => avg(metrics.map((m) => m.phases[i])));
  const bySolveId = new Map(metrics.map((m) => [m.id, m]));

  const entries: TiltEntry[] = [];
  for (const solve of analyzableSolves(solves)) {
    const m = bySolveId.get(solve.id);
    if (!m) continue;
    const moves = solve.reconstruction!.split(/\s+/).filter(Boolean);
    const report = analyzeMistakes({ scramble: solve.scramble, moves, timesMs: solve.moveTimestamps!, totalMs: solve.timeMs });
    const mistakePhases = new Set(report.mistakes.map((x) => x.phase));
    entries.push(...entriesForSolve(mistakePhases, m.phases, baseline));
  }

  return aggregateTilt(entries);
}
