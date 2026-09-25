export type Penalty = "none" | "plus2" | "dnf";

/** WCA puzzle event a session times. */
export type WcaEvent = "222" | "333" | "444" | "555";
/**
 * `randomState`: whether this app's scrambles for the event are WCA-style
 * random-state ones. Only 3x3 is; the others are random-move practice
 * scrambles (see lib/cube-engine/multiScramble.ts) — shown wherever an
 * event is chosen, so nobody mistakes them for competition scrambles.
 */
export const WCA_EVENTS: { id: WcaEvent; label: string; randomState: boolean }[] = [
  { id: "222", label: "2x2", randomState: false },
  { id: "333", label: "3x3", randomState: true },
  { id: "444", label: "4x4", randomState: false },
  { id: "555", label: "5x5", randomState: false },
];

/** Practice category a solve was done under, for filtering stats separately from normal 2-handed solving. */
export type EventTag = "oh" | "feet" | "bld";
export const EVENT_TAGS: { id: EventTag; label: string }[] = [
  { id: "oh", label: "One-Handed" },
  { id: "feet", label: "With Feet" },
  { id: "bld", label: "Blindfolded" },
];

export interface Solve {
  id: string;
  sessionId: string;
  /** Raw time in milliseconds, excluding penalty. */
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  date: number; // epoch ms
  comment?: string;
  /**
   * Cumulative elapsed time at each phase boundary the cuber marked during the
   * solve, in ms, excluding the final stop (which is `timeMs`). A 4-phase solve
   * therefore has 3 entries. Absent on solves timed without phase splits on.
   */
  splits?: number[];
  /** Practice category; absent means an ordinary 2-handed solve. */
  event?: EventTag;
  /**
   * The reconstruction the analyzer verified against this solve's scramble
   * (canonical move tokens, space-separated). Saved so a solve's analysis can
   * be reopened instantly instead of retyped, and so features like the
   * weakness report can look back across solved-and-analyzed history.
   */
  reconstruction?: string;
  /** Average/max BPM during this solve, from a connected BLE heart-rate monitor. */
  heartRate?: { avg: number; max: number };
  /**
   * Elapsed time (ms) when the white cross (U-face cross) first read solved
   * during this solve, detected live off a connected smart cube's own move
   * stream — not a manually marked phase split, so it's its own field
   * rather than reusing `splits`' phase-count-dependent labeling.
   */
  crossMs?: number;
  /**
   * Elapsed time (ms, from solve start) of each move in `reconstruction`,
   * one entry per move — only present for a solve captured live off a smart
   * cube's own move stream, where every move really did happen at that exact
   * moment. Lets a replay play back at the cuber's actual pace (the pauses
   * to look, the bursts to execute) instead of a uniform per-move tempo.
   */
  moveTimestamps?: number[];
  /**
   * Whole-cube rotations (x, y, z…) a gyro-equipped smart cube saw during
   * this solve, each at its elapsed ms from solve start. Kept separate from
   * `reconstruction` — which stays the physical, center-color-named move
   * list — so `moveTimestamps` still lines up with it one-to-one.
   */
  rotations?: { atMs: number; token: string }[];
  /**
   * The rotation-aware reconstruction: inspection rotation, then every move
   * re-expressed in the solver's own frame with regrips inserted where they
   * happened — what a cuber would write by hand. Only present for gyro solves.
   */
  orientedReconstruction?: string;
  /**
   * The continuous gyro stream during this solve — not just the named
   * regrips in `rotations`, every orientation sample the cube reported
   * (thinned to ~20Hz), baked into body-frame quaternions at save time so
   * it replays correctly even if the cube's calibration changes later.
   * Parallel arrays, one entry per sample, ms from solve start. Only on a
   * gyro-equipped connection; absent for solves recorded before this
   * existed, or any solve without a gyro fix at save time.
   */
  gyroStream?: { atMs: number[]; qx: number[]; qy: number[]; qz: number[]; qw: number[] };
  /**
   * When this row last changed (ms, epoch) — set on create and on every edit
   * (penalty, comment, reconstruction). Sync resolves conflicts with it:
   * the most recent change to an id wins, deletions included (see
   * lib/db/merge.ts). Absent on rows from before sync revisions existed,
   * where `date` stands in for it.
   */
  updatedAt?: number;
}

export interface Session {
  id: string;
  name: string;
  event: WcaEvent;
  createdAt: number;
  order: number;
  /** Last change (ms, epoch); `createdAt` stands in for rows that predate it. See Solve.updatedAt. */
  updatedAt?: number;
}

/**
 * A record that something was deleted, kept so sync can tell "deleted on
 * another device" apart from "never seen here" — without it, any device
 * that still had the row would quietly bring it back.
 */
export interface Deletion {
  id: string;
  kind: "solve" | "session";
  deletedAt: number;
}

/** Final time including +2 penalty, or null for DNF. */
export function solveFinalMs(solve: Pick<Solve, "timeMs" | "penalty">): number | null {
  if (solve.penalty === "dnf") return null;
  if (solve.penalty === "plus2") return solve.timeMs + 2000;
  return solve.timeMs;
}
