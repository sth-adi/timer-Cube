import { inspectionPenalty } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";
import type { SolveGyroSummary } from "@/lib/gyro/solveGyro";
import type { GazeReport } from "@/lib/gaze/gaze";
import type { Milestones } from "@/lib/smartcube/milestones";
import type { TurnRepair } from "@/lib/smartcube/turnRepair";
import type { SolveRecap } from "@/lib/store/recapStore";

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

/** Runs one optional analysis step: whatever it throws, the step just yields `fallback` and the save carries on without its extras. */
export function guardedStep<T>(step: () => T, fallback: T, onFail?: (error: unknown) => void): T {
  try {
    return step();
  } catch (error) {
    onFail?.(error);
    return fallback;
  }
}

/** The analysis steps a save runs before it records the solve. Injected so each can be swapped (or made to throw) in a test. */
export interface SolveSaveSteps {
  /** The gyro's read on the solve (regrips, oriented reconstruction), or null without gyro data. */
  gyro: () => SolveGyroSummary | null;
  /** The facelets the cube started the solve in. */
  startFacelets: () => string;
  /** Where the eyes went during inspection; only asked once there are facelets to read it against. */
  gaze: (startFacelets: string) => GazeReport | null;
  /** Puts a turn lost over Bluetooth back: the fix, "intact" (nothing missing), or null (can't be done). */
  repair: () => TurnRepair | "intact" | null;
  /** The phase milestones of the repaired solve. */
  milestonesOf: (fixed: TurnRepair) => Milestones | null;
}

export interface SolveSaveInput {
  startedAtMs: number;
  /** The turns as recorded, joined, and their ms from the first turn. */
  reconstruction: string;
  moveTimestampsRel: number[];
  /** The cube reported a turn went missing and corrected itself mid-solve. */
  correctedDuringSolve: boolean;
}

/** Everything the auto-save needs besides the time, scramble and extras it already has: always usable, with or without any analysis step. */
export interface SolveSaveAssembly {
  gyro: SolveGyroSummary | null;
  gaze: SolveRecap["gaze"];
  /** The reconstruction and its timestamps to save; undefined when the turns can't be trusted to solve the scramble. */
  reconstruction: string | undefined;
  moveTimestamps: number[] | undefined;
  repair: TurnRepair | null;
  repairedSplits: number[] | undefined;
  repairedCrossMs: number | undefined;
  turnLoss: SolveRecap["turnLoss"];
  /** The repaired turns with absolute stamps and their milestones, for the store to adopt, once both are known. */
  adopt: { tokens: string[]; times: number[]; milestones: Milestones } | null;
  /** Names of the steps that threw, for a console note. */
  failed: string[];
}

/**
 * Assembles what a finished solve saves, with every analysis step in its own try/catch so a throw
 * in one (a malformed gyro log, an unparsable scramble) only drops that step's extras. The time,
 * scramble and turns are never at risk: this always returns, and the caller records the solve
 * from it unconditionally.
 *
 * A step failing is read the cautious way. If the lost-turn repair throws, the turns are treated
 * as unrepairable (time only, no reconstruction the analyses would trip over); if only the
 * repaired milestones throw, the repaired turns still stand but the splits and the adopt are dropped.
 */
export function assembleSolveSave(input: SolveSaveInput, steps: SolveSaveSteps): SolveSaveAssembly {
  const failed: string[] = [];
  const note = (name: string) => () => void failed.push(name);

  const gyro = guardedStep(steps.gyro, null, note("gyro"));
  const startFacelets = guardedStep(steps.startFacelets, null, note("facelets"));
  const gazeReport = startFacelets !== null ? guardedStep(() => steps.gaze(startFacelets), null, note("gaze")) : null;
  const gaze: SolveRecap["gaze"] = gazeReport && startFacelets !== null ? { report: gazeReport, facelets: startFacelets } : null;

  const out: SolveSaveAssembly = {
    gyro,
    gaze,
    reconstruction: input.reconstruction,
    moveTimestamps: input.moveTimestampsRel,
    repair: null,
    repairedSplits: undefined,
    repairedCrossMs: undefined,
    turnLoss: undefined,
    adopt: null,
    failed,
  };
  if (!input.correctedDuringSolve) return out;

  // A thrown repair is "could not be done": the time stands, the recap doesn't.
  const fixed = guardedStep<TurnRepair | "intact" | null>(steps.repair, null, note("repair"));
  if (fixed === "intact") return out;
  if (fixed === null) {
    out.reconstruction = undefined;
    out.moveTimestamps = undefined;
    out.turnLoss = { kind: "time-only" };
    return out;
  }
  out.repair = fixed;
  out.reconstruction = fixed.tokens.join(" ");
  out.moveTimestamps = fixed.times;
  out.turnLoss = { kind: "repaired", change: fixed.change };
  const m = guardedStep(() => steps.milestonesOf(fixed), null, note("milestones"));
  if (m) {
    const start = input.startedAtMs;
    if (m.crossAtMs !== null) out.repairedCrossMs = m.crossAtMs - start;
    if (m.crossAtMs !== null && m.f2lAtMs !== null && m.ollAtMs !== null) out.repairedSplits = [m.crossAtMs, m.f2lAtMs, m.ollAtMs].map((t) => t - start);
    out.adopt = { tokens: fixed.tokens, times: fixed.times.map((t) => start + t), milestones: m };
  }
  return out;
}
