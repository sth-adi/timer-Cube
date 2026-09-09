export type Penalty = "none" | "plus2" | "dnf";

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
