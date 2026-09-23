export type Penalty = "none" | "plus2" | "dnf";

/** WCA puzzle event a session times. */
export type WcaEvent = "222" | "333" | "444" | "555";
export const WCA_EVENTS: { id: WcaEvent; label: string }[] = [
  { id: "222", label: "2x2" },
  { id: "333", label: "3x3" },
  { id: "444", label: "4x4" },
  { id: "555", label: "5x5" },
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
}

export interface Session {
  id: string;
  name: string;
  event: WcaEvent;
  createdAt: number;
  order: number;
}

/** Final time including +2 penalty, or null for DNF. */
export function solveFinalMs(solve: Pick<Solve, "timeMs" | "penalty">): number | null {
  if (solve.penalty === "dnf") return null;
  if (solve.penalty === "plus2") return solve.timeMs + 2000;
  return solve.timeMs;
}
