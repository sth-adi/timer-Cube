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
