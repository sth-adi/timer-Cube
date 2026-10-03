import type { Session, Solve } from "@/types";

export interface SessionSuggestion {
  id: string;
  name: string;
  /** Solves in the suggested session, and in the one currently open. */
  count: number;
  activeCount: number;
}

/** Below this the other session isn't "your history", just another session. */
const MIN_SOLVES = 20;

/**
 * After a sync brings another device's history in, this device may still be looking at its own
 * fresh session (every device starts one) while the real history sits under another. Names don't
 * help — they're all "Session 1" — so this points at the session with by far the most solves.
 * Null when the open session is already the main one, or nothing else is clearly bigger.
 */
export function suggestSession(sessions: readonly Session[], solves: readonly Solve[], activeId: string | null): SessionSuggestion | null {
  if (!activeId) return null;
  const counts = new Map<string, number>();
  for (const s of solves) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);
  const activeCount = counts.get(activeId) ?? 0;
  let best: Session | null = null;
  for (const s of sessions) {
    if (s.id === activeId) continue;
    if ((counts.get(s.id) ?? 0) > (best ? counts.get(best.id) ?? 0 : 0)) best = s;
  }
  if (!best) return null;
  const count = counts.get(best.id) ?? 0;
  if (count < MIN_SOLVES || count < activeCount * 3) return null;
  return { id: best.id, name: best.name, count, activeCount };
}
