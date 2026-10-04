import type { Solve } from "@/types";
import { caseRecords, type CaseRecord } from "./caseRecord";
import { f2lCaseStats, solveF2lTurns, type F2lCaseStat } from "./f2lCaseStats";
import { recognitionStats, solveCases, type RecognitionStat } from "./caseHistory";
import { analyzeCrossOrientations, solveCrossLengths, type CrossAdvisorReport } from "./crossAdvisor";
import { solveBreakdown } from "./solveBreakdown";

/**
 * The all-time history the post-solve recap reads (per-case times, F2L turn
 * counts, recognition norms, the cross colour advisor), worked out in idle
 * time so the recap itself paints first.
 *
 * Every analysis caches its per-solve work, so a pass over thousands of
 * solves costs only the ones it hasn't seen: `scheduleHistoryStats` replays
 * those a slice at a time while the browser is idle, then folds everything
 * into the aggregates (a cheap pass over cached rows) and hands them over.
 * Callers keep showing the previous result until then.
 */

export interface HistoryStats {
  caseHistory: ReadonlyMap<string, CaseRecord>;
  f2lHistory: ReadonlyMap<string, F2lCaseStat>;
  recogHistory: ReadonlyMap<string, RecognitionStat>;
  crossAdvisor: CrossAdvisorReport | null;
}

/** What shows before the first pass finishes (and for an empty history). */
export const NO_HISTORY: HistoryStats = {
  caseHistory: new Map(),
  f2lHistory: new Map(),
  recogHistory: new Map(),
  crossAdvisor: null,
};

/** The aggregates over `solves`, synchronously. */
export function computeHistoryStats(solves: readonly Solve[]): HistoryStats {
  return {
    caseHistory: caseRecords(solves),
    f2lHistory: f2lCaseStats(solves),
    recogHistory: recognitionStats(solves),
    crossAdvisor: analyzeCrossOrientations(solves),
  };
}

/** Fills every per-solve cache the aggregates read, so the aggregate pass itself replays nothing. */
export function warmSolveHistory(solve: Solve): void {
  solveBreakdown(solve);
  solveCases(solve);
  solveF2lTurns(solve);
  if (solve.scramble && solve.penalty !== "dnf") solveCrossLengths(solve);
}

/** Runs `step` when the browser is idle; `step` gets a "ms of budget left" function. Returns a canceller. */
export type IdleScheduler = (step: (budgetMs: () => number) => void) => () => void;

/** requestIdleCallback where it exists, otherwise a short timeout with a fixed slice. */
export const scheduleIdle: IdleScheduler = (step) => {
  if (typeof requestIdleCallback === "function") {
    const h = requestIdleCallback((d) => step(() => d.timeRemaining()), { timeout: 2000 });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(() => {
    const end = performance.now() + 8;
    step(() => end - performance.now());
  }, 50);
  return () => clearTimeout(h);
};

/** Smallest slice worth starting another solve in. */
const MIN_BUDGET_MS = 2;

/**
 * Warms the caches for every solve not yet seen, a slice per idle period (at
 * least one solve each, so a starved browser still progresses), then calls
 * `onDone` with the aggregates. Returns a canceller for an effect cleanup;
 * after it runs, `onDone` is never called.
 */
export function scheduleHistoryStats(solves: readonly Solve[], onDone: (stats: HistoryStats) => void, schedule: IdleScheduler = scheduleIdle): () => void {
  // Newest first: those are the ones a recap is about to need.
  let next = solves.length - 1;
  let cancel = () => {};
  let cancelled = false;
  const run = (budgetMs: () => number) => {
    let did = false;
    while (next >= 0 && (!did || budgetMs() > MIN_BUDGET_MS)) {
      try {
        warmSolveHistory(solves[next]);
      } catch {
        // A solve that can't be replayed is skipped here; the aggregates decide what to do with it.
      }
      did = true;
      next--;
    }
    if (cancelled) return;
    if (next >= 0) {
      cancel = schedule(run);
      return;
    }
    onDone(computeHistoryStats(solves));
  };
  cancel = schedule(run);
  return () => {
    cancelled = true;
    cancel();
  };
}
