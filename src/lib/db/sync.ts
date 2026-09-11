import { db } from "./db";
import type { Session, Solve } from "@/types";

export interface SyncPayload {
  sessions: Session[];
  solves: Solve[];
}

/** Everything this device has — the whole payload sent to a peer on connect. */
export async function exportSyncPayload(): Promise<SyncPayload> {
  const [sessions, solves] = await Promise.all([db.sessions.toArray(), db.solves.toArray()]);
  return { sessions, solves };
}

/**
 * Merges a peer's sessions/solves into local storage. Purely additive: a row
 * that already exists locally (matched by id) is left exactly as it is —
 * this can never overwrite an edit you made after the two devices last saw
 * each other, only add rows the other device has that this one doesn't.
 */
export async function mergeSyncPayload(payload: SyncPayload): Promise<{ addedSessions: number; addedSolves: number }> {
  return db.transaction("rw", db.sessions, db.solves, async () => {
    const existingSessionIds = new Set(await db.sessions.toCollection().primaryKeys());
    const newSessions = payload.sessions.filter((s) => !existingSessionIds.has(s.id));
    if (newSessions.length > 0) await db.sessions.bulkAdd(newSessions);

    const existingSolveIds = new Set(await db.solves.toCollection().primaryKeys());
    const newSolves = payload.solves.filter((s) => !existingSolveIds.has(s.id));
    if (newSolves.length > 0) await db.solves.bulkAdd(newSolves);

    return { addedSessions: newSessions.length, addedSolves: newSolves.length };
  });
}
