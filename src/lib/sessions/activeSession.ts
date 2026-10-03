import type { Session, Solve } from "@/types";

const KEY = "cube-timer:active-session";

/** The session this device last had open, if it was saved. */
export function readSavedSessionId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Unsaved: the next load falls back to the session with the most solves.
  }
}

const AUTO_KEY = "cube-timer:auto-session";

/** The empty "Session 1" this device made for itself (see ensureDefaultSession), until a cloud sync settles whether it's needed. */
export function readAutoSessionId(): string | null {
  try {
    return localStorage.getItem(AUTO_KEY);
  } catch {
    return null;
  }
}

export function rememberAutoSessionId(id: string): void {
  try {
    localStorage.setItem(AUTO_KEY, id);
  } catch {
    // Not remembered: the empty session just stays, as it did before.
  }
}

export function forgetAutoSessionId(): void {
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    // Nothing to forget.
  }
}

/**
 * Which session to open on load: the one you last had open on this device; failing that, the one
 * with the most solves (on a device that's just synced, that's your history, not the empty session
 * the device made for itself); failing that, the first.
 */
export function pickInitialSession(sessions: readonly Session[], solves: readonly Solve[], savedId: string | null): Session | null {
  if (sessions.length === 0) return null;
  const saved = savedId ? sessions.find((s) => s.id === savedId) : undefined;
  if (saved) return saved;
  const counts = new Map<string, number>();
  for (const s of solves) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);
  let best = sessions[0];
  for (const s of sessions) if ((counts.get(s.id) ?? 0) > (counts.get(best.id) ?? 0)) best = s;
  return best;
}

export interface SessionSummary {
  count: number;
  /** Date of the newest solve, or null for an empty session. */
  lastSolveAt: number | null;
}

/** Solve count and most recent solve per session — what tells five sessions all called "Session 1" apart. */
export function summarizeSessions(solves: readonly Solve[]): Map<string, SessionSummary> {
  const out = new Map<string, SessionSummary>();
  for (const s of solves) {
    const cur = out.get(s.sessionId) ?? { count: 0, lastSolveAt: null };
    cur.count += 1;
    if (cur.lastSolveAt === null || s.date > cur.lastSolveAt) cur.lastSolveAt = s.date;
    out.set(s.sessionId, cur);
  }
  return out;
}
