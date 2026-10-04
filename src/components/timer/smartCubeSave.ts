import { inspectionPenalty } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";

/** Cumulative phase-boundary ms (from solve start), null for a phase not yet reached. */
export interface PhaseBoundaries {
  cross: number | null;
  f2l: number | null;
  oll: number | null;
  pll: number | null;
}

/** The [cross, f2l, oll] splits a saved solve carries, or undefined until all three are known. */
export function phaseSplits(boundaries: PhaseBoundaries | null): number[] | undefined {
  if (!boundaries || boundaries.cross === null || boundaries.f2l === null || boundaries.oll === null) return undefined;
  return [boundaries.cross, boundaries.f2l, boundaries.oll];
}

/**
 * The penalty inspection earned: +2 past 15s, DNF past 17s, measured from the moment the scramble
 * matched to the first turn (same rule as the keyboard timer). Undefined with inspection off.
 */
export function inspectionPenaltyFor(startedAtMs: number | null, inspectionStartedAtMs: number | null): Penalty | undefined {
  if (startedAtMs === null || inspectionStartedAtMs === null) return undefined;
  return inspectionPenalty(startedAtMs - inspectionStartedAtMs);
}

/**
 * What every way of saving a smart-cube solve passes alongside the time: the penalty and the
 * splits. The automatic save, "It's solved" and "Save as DNF" all go through here, so none of
 * them can drop a +2 or the phase splits again. `forcePenalty` is for a stop the cuber chose
 * (DNF), which wins over whatever inspection earned.
 */
export function solveSaveExtras({
  startedAtMs,
  inspectionStartedAtMs,
  boundaries,
  forcePenalty,
}: {
  startedAtMs: number | null;
  inspectionStartedAtMs: number | null;
  boundaries: PhaseBoundaries | null;
  forcePenalty?: Penalty;
}): { penalty: Penalty | undefined; splits: number[] | undefined } {
  return {
    penalty: forcePenalty ?? inspectionPenaltyFor(startedAtMs, inspectionStartedAtMs),
    splits: phaseSplits(boundaries),
  };
}
