import { db } from "./db";
import { planMerge, solvesAMergeCanTouch, withLocalOnlyFields, type SyncState } from "./merge";
import type { Deletion, FullSolve, Session } from "@/types";

export interface SyncPayload {
  sessions: Session[];
  solves: FullSolve[];
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

export interface MergeOptions {
  /** Fill in the solve fields a cloud row may lack (cube, repaired) from the local row of the same id — see withLocalOnlyFields. */
  carryLocalOnlyFields?: boolean;
}

export interface MergeOutcome {
  result: MergeResult;
  /**
   * Every solve on this device as the merge leaves it — only when the merge had to read the whole
   * table anyway (a large payload); null when it read just the solves the payload touches. Lets a
   * caller that needs the whole table next (the cloud push) not read it a second time.
   */
  solves: FullSolve[] | null;
}

/** A merge whose payload names at least this fraction of the table reads the table whole: one scan beats that many lookups. */
const WHOLE_TABLE_FRACTION = 4;

/**
 * Merges another device's (or the cloud's) state into local storage under
 * the one sync rule — the most recent change to each id wins, deletions
 * included (lib/db/merge.ts). Both sides applying this to each other's
 * snapshot leaves them identical.
 */
export async function mergeSyncPayload(payload: SyncPayload, options: MergeOptions = {}): Promise<MergeResult> {
  return (await applySyncPayload(payload, options)).result;
}

/**
 * mergeSyncPayload, also handing back the whole solves table when it was read. A cloud pull
 * brings a handful of rows, and a smart-cube solve carries a stream of a few KB, so reading
 * thousands of them to merge a handful is what stalled phones: sessions and deletions are small
 * and read whole, but of the solves only those the payload can touch are (solvesAMergeCanTouch).
 * All reads happen inside the transaction, so the merge sees — and writes over — nothing stale.
 */
export async function applySyncPayload(payload: SyncPayload, options: MergeOptions = {}): Promise<MergeOutcome> {
  return db.transaction("rw", db.sessions, db.solves, db.deletions, async () => {
    const [sessions, deletions, total] = await Promise.all([db.sessions.toArray(), db.deletions.toArray(), db.solves.count()]);
    const remoteDeletions = payload.deletions ?? [];
    const touch = solvesAMergeCanTouch({ deletions }, { solves: payload.solves, deletions: remoteDeletions });
    const whole = touch.solveIds.length * WHOLE_TABLE_FRACTION >= total;
    let solves: FullSolve[];
    if (whole) {
      solves = await db.solves.toArray();
    } else {
      const [byId, bySession] = await Promise.all([
        db.solves.bulkGet(touch.solveIds),
        touch.sessionIds.length ? db.solves.where("sessionId").anyOf(touch.sessionIds).toArray() : Promise.resolve([] as FullSolve[]),
      ]);
      const found = new Map<string, FullSolve>();
      for (const s of byId) if (s) found.set(s.id, s);
      for (const s of bySession) found.set(s.id, s);
      solves = [...found.values()];
    }
    const remoteSolves = options.carryLocalOnlyFields ? withLocalOnlyFields(payload.solves, solves) : payload.solves;
    const plan = planMerge({ sessions, solves, deletions }, { sessions: payload.sessions, solves: remoteSolves, deletions: remoteDeletions });
    if (plan.deleteSolveIds.length) await db.solves.bulkDelete(plan.deleteSolveIds);
    if (plan.deleteSessionIds.length) await db.sessions.bulkDelete(plan.deleteSessionIds);
    if (plan.putSessions.length) await db.sessions.bulkPut(plan.putSessions);
    if (plan.putSolves.length) await db.solves.bulkPut(plan.putSolves);
    if (plan.putDeletions.length) await db.deletions.bulkPut(plan.putDeletions);
    let after: FullSolve[] | null = null;
    if (whole) {
      const byId = new Map(solves.map((s) => [s.id, s]));
      for (const id of plan.deleteSolveIds) byId.delete(id);
      for (const s of plan.putSolves) byId.set(s.id, s);
      after = [...byId.values()];
    }
    return {
      result: { addedSessions: plan.added.sessions, addedSolves: plan.added.solves, updated: plan.updated, removed: plan.removed },
      solves: after,
    };
  });
}
