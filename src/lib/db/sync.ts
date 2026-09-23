import { db } from "./db";
import { planMerge, type SyncState } from "./merge";
import type { Deletion, Session, Solve } from "@/types";

export interface SyncPayload {
  sessions: Session[];
  solves: Solve[];
  /** Absent from peers running a version from before deletions synced. */
  deletions?: Deletion[];
}

export interface MergeResult {
  addedSessions: number;
  addedSolves: number;
  /** Existing rows replaced by a newer version from the other side. */
  updated: number;
  /** Rows removed because the other side deleted them more recently. */
  removed: number;
}

export async function readLocalState(): Promise<SyncState> {
  const [sessions, solves, deletions] = await Promise.all([db.sessions.toArray(), db.solves.toArray(), db.deletions.toArray()]);
  return { sessions, solves, deletions };
}

/** Everything this device has — the whole payload sent to a peer on connect. */
export async function exportSyncPayload(): Promise<SyncPayload> {
  return readLocalState();
}

/**
 * Merges another device's (or the cloud's) state into local storage under
 * the one sync rule — the most recent change to each id wins, deletions
 * included (lib/db/merge.ts). Both sides applying this to each other's
 * snapshot leaves them identical.
 */
export async function mergeSyncPayload(payload: SyncPayload): Promise<MergeResult> {
  return db.transaction("rw", db.sessions, db.solves, db.deletions, async () => {
    const local = await readLocalState();
    const plan = planMerge(local, { sessions: payload.sessions, solves: payload.solves, deletions: payload.deletions ?? [] });
    if (plan.deleteSolveIds.length) await db.solves.bulkDelete(plan.deleteSolveIds);
    if (plan.deleteSessionIds.length) await db.sessions.bulkDelete(plan.deleteSessionIds);
    if (plan.putSessions.length) await db.sessions.bulkPut(plan.putSessions);
    if (plan.putSolves.length) await db.solves.bulkPut(plan.putSolves);
    if (plan.putDeletions.length) await db.deletions.bulkPut(plan.putDeletions);
    return { addedSessions: plan.added.sessions, addedSolves: plan.added.solves, updated: plan.updated, removed: plan.removed };
  });
}
