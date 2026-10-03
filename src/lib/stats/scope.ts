import type { Session, Solve } from "@/types";

/** Which solves the stats and insights panels look at. */
export type StatsScope = "session" | "all";

/**
 * The solves a stats view should be computed from. "session" is the open
 * session as-is; "all" is every session sharing the open session's event,
 * oldest first, so a 2x2 history never bleeds into 3x3 numbers. With no
 * resolvable open session there's no event to match, so "all" falls back to
 * the session solves rather than guessing.
 */
export function scopedSolves(
  scope: StatsScope,
  activeSessionId: string | null,
  sessions: readonly Session[],
  sessionSolves: Solve[],
  allSolves: readonly Solve[],
): Solve[] {
  if (scope === "session") return sessionSolves;
  const active = sessions.find((s) => s.id === activeSessionId);
  if (!active) return sessionSolves;
  const sameEvent = new Set(sessions.filter((s) => s.event === active.event).map((s) => s.id));
  return allSolves.filter((s) => sameEvent.has(s.sessionId)).sort((a, b) => a.date - b.date);
}
