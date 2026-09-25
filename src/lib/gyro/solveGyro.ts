import {
  detectRotations,
  matToQuat,
  orientationFromQuat,
  orientationLabel,
  orientedReconstruction,
  type GyroCalibration,
  type GyroSample,
  type Quat,
} from "./orientation";

export interface GyroStreamData {
  atMs: number[];
  qx: number[];
  qy: number[];
  qz: number[];
  qw: number[];
}

export interface SolveGyroSummary {
  /** Mid-solve regrips, ms from solve start. */
  rotations: { atMs: number; token: string }[];
  /** Inspection rotation + moves in the solver's own frame with regrips inserted — see orientedReconstruction. */
  orientedReconstruction: string;
  /** e.g. "yellow top · green front" — how the cube was held when the first move landed. */
  startLabel: string;
  /** The continuous gyro stream for the solve, baked into body-frame quaternions — see buildGyroStream. Null when there weren't enough in-window samples to be worth keeping. */
  stream: GyroStreamData | null;
}

/** No denser than this — a camera pan reads smoothly well under 20Hz, and it keeps years of solves from bloating local storage (and, once synced, the cloud database too). */
const STREAM_MIN_GAP_MS = 50;

/**
 * The raw gyro samples for just the solve itself (not the inspection
 * stretch before it), thinned to STREAM_MIN_GAP_MS and each one baked from
 * the raw sensor quaternion into a body-frame quaternion right now — using
 * whatever `ref`/`calibration` are in effect for *this* connection — so a
 * later recalibration can never reinterpret this solve's data differently
 * than it actually happened.
 */
function buildGyroStream(
  samples: readonly GyroSample[],
  ref: Quat,
  calibration: GyroCalibration,
  startedAtMs: number,
  endedAtMs: number,
): GyroStreamData | null {
  const atMs: number[] = [];
  const qx: number[] = [];
  const qy: number[] = [];
  const qz: number[] = [];
  const qw: number[] = [];
  let lastKeptAt = -Infinity;
  for (const s of samples) {
    if (s.atMs <= startedAtMs || s.atMs > endedAtMs) continue;
    if (s.atMs - lastKeptAt < STREAM_MIN_GAP_MS) continue;
    lastKeptAt = s.atMs;
    const q = matToQuat(orientationFromQuat(s.q, ref, calibration));
    atMs.push(s.atMs - startedAtMs);
    qx.push(q.x);
    qy.push(q.y);
    qz.push(q.z);
    qw.push(q.w);
  }
  return atMs.length > 0 ? { atMs, qx, qy, qz, qw } : null;
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
    stream: buildGyroStream(samples, ref, calibration, startedAtMs, moves[moves.length - 1].timeStampMs),
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
