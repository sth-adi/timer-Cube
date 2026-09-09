export type Penalty = "none" | "plus2" | "dnf";

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
}

export interface Session {
  id: string;
  name: string;
  event: "333"; // room to grow to other WCA events later
  createdAt: number;
  order: number;
}

/** Final time including +2 penalty, or null for DNF. */
export function solveFinalMs(solve: Pick<Solve, "timeMs" | "penalty">): number | null {
  if (solve.penalty === "dnf") return null;
  if (solve.penalty === "plus2") return solve.timeMs + 2000;
  return solve.timeMs;
}
