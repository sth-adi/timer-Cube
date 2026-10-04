import type { Solve } from "@/types";
import { scheduleIdle, type IdleScheduler } from "./historyStats";
import { countsForHabits, mistakeHabits, solveMistakeReport, type MistakeHabit } from "./mistakeRadar";
import { presentCases, solveSummary } from "./solveFilter";

/**
 * Idle-time versions of the solve-list aggregates, in the same pattern as
 * `scheduleHistoryStats`: every per-solve analysis is cached, so these replay
 * the solves not yet seen a slice at a time while the browser is idle, then
 * fold the (now cheap) aggregate and hand it over. Callers keep showing the
 * previous result until `onDone` fires.
 */

/** Smallest slice worth starting another solve in. */
const MIN_BUDGET_MS = 2;

/**
 * Runs `warm` over every solve, newest first, a slice per idle period (at least
 * one solve each, so a starved browser still progresses), then `onDone`.
 * Returns a canceller; after it runs, `onDone` is never called.
 */
export function scheduleWarm(solves: readonly Solve[], warm: (solve: Solve) => void, onDone: () => void, schedule: IdleScheduler = scheduleIdle): () => void {
  let next = solves.length - 1;
  let cancel = () => {};
  let cancelled = false;
  const run = (budgetMs: () => number) => {
    let did = false;
    while (next >= 0 && (!did || budgetMs() > MIN_BUDGET_MS)) {
      try {
        warm(solves[next]);
      } catch {
        // A solve that can't be replayed is skipped; the aggregate decides what to do with it.
      }
      did = true;
      next--;
    }
    if (cancelled) return;
    if (next >= 0) {
      cancel = schedule(run);
      return;
    }
    onDone();
  };
  cancel = schedule(run);
  return () => {
    cancelled = true;
    cancel();
  };
}

/** `mistakeHabits(solves)`, with the replaying done in idle time first. */
export function scheduleMistakeHabits(solves: readonly Solve[], onDone: (habits: MistakeHabit[]) => void, schedule: IdleScheduler = scheduleIdle): () => void {
  return scheduleWarm(
    solves.filter(countsForHabits),
    (s) => void solveMistakeReport(s),
    () => onDone(mistakeHabits(solves)),
    schedule,
  );
}

/** `presentCases(solves)` (the filter menus), with every solve's summary worked out in idle time first. */
export function schedulePresentCases(solves: readonly Solve[], onDone: (cases: ReturnType<typeof presentCases>) => void, schedule: IdleScheduler = scheduleIdle): () => void {
  return scheduleWarm(solves, (s) => void solveSummary(s), () => onDone(presentCases(solves)), schedule);
}
