import {
  detectRotations,
  orientationLabel,
  orientedReconstruction,
  type GyroCalibration,
  type GyroSample,
  type Quat,
} from "./orientation";

export interface SolveGyroSummary {
  /** Mid-solve regrips, ms from solve start. */
  rotations: { atMs: number; token: string }[];
  /** Inspection rotation + moves in the solver's own frame with regrips inserted — see orientedReconstruction. */
  orientedReconstruction: string;
  /** e.g. "yellow top · green front" — how the cube was held when the first move landed. */
  startLabel: string;
}

/**
 * Everything the gyro contributes to one finished solve, from the samples
 * logged since it was armed. Returns null when there's nothing to go on
 * (no gyro on this cube, or no reference pose yet) rather than guessing.
 */
export function summarizeSolveGyro(
  samples: readonly GyroSample[],
  ref: Quat | null,
  calibration: GyroCalibration,
  moves: readonly { token: string; timeStampMs: number }[],
  startedAtMs: number,
): SolveGyroSummary | null {
  if (!ref || samples.length === 0 || moves.length === 0) return null;
  const { segments, rotations } = detectRotations(samples, ref, calibration);
  const { tokens, startOrientation } = orientedReconstruction(
    moves.map((m) => m.token),
    moves.map((m) => m.timeStampMs),
    segments,
    rotations,
    startedAtMs,
  );
  return {
    rotations: rotations.filter((r) => r.atMs > startedAtMs).map((r) => ({ atMs: r.atMs - startedAtMs, token: r.token })),
    orientedReconstruction: tokens.join(" "),
    startLabel: orientationLabel(startOrientation),
  };
}

/**
 * Buckets a solve's regrips into its phases, given each phase's end time
 * (ms from start, ascending — e.g. the post-solve table's rows). A rotation
 * belongs to the phase it happened *during*: one done in the pause after
 * the cross counts against F2L, since that's the phase it delayed.
 */
export function rotationsPerPhase(rotations: readonly { atMs: number }[], phaseEndsMs: readonly (number | null)[]): number[] {
  const counts = phaseEndsMs.map(() => 0);
  for (const r of rotations) {
    const i = phaseEndsMs.findIndex((end) => end !== null && r.atMs <= end);
    if (i >= 0) counts[i] += 1;
    else if (counts.length > 0) counts[counts.length - 1] += 1;
  }
  return counts;
}
