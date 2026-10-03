import { db, newId } from "./db";
import { contentKey, solveRevision } from "./merge";
import type { EventTag, Penalty, Solve } from "@/types";

export async function addSolve(input: {
  sessionId: string;
  timeMs: number;
  scramble: string;
  penalty?: Penalty;
  splits?: number[];
  event?: EventTag;
  reconstruction?: string;
  heartRate?: { avg: number; max: number };
  crossMs?: number;
  moveTimestamps?: number[];
  rotations?: { atMs: number; token: string }[];
  orientedReconstruction?: string;
  gyroStream?: { atMs: number[]; qx: number[]; qy: number[]; qz: number[]; qw: number[] };
  cube?: Solve["cube"];
  repaired?: Solve["repaired"];
}): Promise<Solve> {
  const solve: Solve = {
    id: newId(),
    sessionId: input.sessionId,
    timeMs: input.timeMs,
    penalty: input.penalty ?? "none",
    scramble: input.scramble,
    date: Date.now(),
    updatedAt: Date.now(),
    // Omitted rather than stored empty, so "was this solve phase-timed?" is a
    // simple presence check everywhere downstream.
    ...(input.splits && input.splits.length > 0 ? { splits: input.splits } : {}),
    ...(input.event ? { event: input.event } : {}),
    ...(input.reconstruction ? { reconstruction: input.reconstruction } : {}),
    ...(input.heartRate ? { heartRate: input.heartRate } : {}),
    ...(input.crossMs !== undefined ? { crossMs: input.crossMs } : {}),
    ...(input.moveTimestamps && input.moveTimestamps.length > 0 ? { moveTimestamps: input.moveTimestamps } : {}),
    ...(input.rotations ? { rotations: input.rotations } : {}),
    ...(input.orientedReconstruction ? { orientedReconstruction: input.orientedReconstruction } : {}),
    ...(input.gyroStream ? { gyroStream: input.gyroStream } : {}),
    ...(input.cube ? { cube: input.cube } : {}),
    ...(input.repaired ? { repaired: input.repaired } : {}),
  };
  await db.solves.add(solve);
  return solve;
}

/**
 * Every edit bumps updatedAt — the revision sync uses to decide which version of a solve wins.
 * Returns the new updatedAt, so a caller can patch its in-memory copy without re-reading the row.
 */
export async function updateSolve(id: string, changes: Partial<Omit<Solve, "id">>): Promise<number> {
  const updatedAt = Date.now();
  await db.solves.update(id, { ...changes, updatedAt });
  return updatedAt;
}

/** The same edit on several solves in one transaction, all-or-nothing. Returns the shared updatedAt. */
export async function updateSolvesBulk(ids: string[], changes: Partial<Omit<Solve, "id">>): Promise<number> {
  const updatedAt = Date.now();
  await db.transaction("rw", db.solves, async () => {
    for (const id of ids) await db.solves.update(id, { ...changes, updatedAt });
  });
  return updatedAt;
}

/**
 * Puts deleted solves back: removes their deletion records and re-adds the rows
 * with a fresh `updatedAt`, which is what makes the restore win over the
 * deletion on every other device too (the newest change wins — see merge.ts).
 */
export async function restoreSolves(solves: Solve[]): Promise<Solve[]> {
  if (solves.length === 0) return [];
  const now = Date.now();
  const rows = solves.map((s) => ({ ...s, updatedAt: Math.max(now, (s.updatedAt ?? 0) + 1) }));
  await db.transaction("rw", db.solves, db.deletions, async () => {
    await db.deletions.bulkDelete(solves.map((s) => s.id));
    await db.solves.bulkPut(rows);
  });
  return rows;
}

/** Deletes a solve and records the deletion, so syncing can't bring it back from another device. */
export async function deleteSolve(id: string): Promise<void> {
  await db.transaction("rw", db.solves, db.deletions, async () => {
    await db.solves.delete(id);
    await db.deletions.put({ id, kind: "solve", deletedAt: Date.now() });
  });
}

export async function getSessionSolves(sessionId: string): Promise<Solve[]> {
  return db.solves.where("sessionId").equals(sessionId).sortBy("date");
}

/** Every solve across every session — the basis for lifetime achievements/streaks/goals. */
export async function getAllSolves(): Promise<Solve[]> {
  return db.solves.orderBy("date").toArray();
}

export async function deleteAllSolvesForSession(sessionId: string): Promise<void> {
  await db.transaction("rw", db.solves, db.deletions, async () => {
    const ids = (await db.solves.where("sessionId").equals(sessionId).primaryKeys()) as string[];
    const deletedAt = Date.now();
    await db.solves.bulkDelete(ids);
    await db.deletions.bulkPut(ids.map((id) => ({ id, kind: "solve" as const, deletedAt })));
  });
}

/**
 * One solve as an import file carries it: every stored field but the session,
 * which the import chooses. `id` and `updatedAt` are there when the file kept
 * them (this app's own exports do); csTimer files and older exports lack them.
 */
export type ImportRow = Omit<Solve, "id" | "sessionId" | "updatedAt"> & { id?: string; updatedAt?: number };

export interface ImportResult {
  /** Solves new to this device (including ones deleted here that the file brought back). */
  added: number;
  /** Solves already here whose version in the file is newer, so it replaced them. */
  updated: number;
  /** Solves already here: the same id and not newer, or the same date, time and scramble in this session. */
  skipped: number;
}

/**
 * What identifies a solve without an id: when it was done, how long it took,
 * and on what scramble. The date is compared to the second because csTimer
 * keeps whole seconds — so a csTimer export of these very solves still matches.
 */
export function solveFingerprint(s: Pick<Solve, "date" | "timeMs" | "scramble">): string {
  return `${Math.floor(s.date / 1000)}|${Math.round(s.timeMs)}|${s.scramble.trim()}`;
}

function importedSolve(s: ImportRow, id: string, sessionId: string, updatedAt: number): Solve {
  return {
    id,
    sessionId,
    updatedAt,
    timeMs: s.timeMs,
    penalty: s.penalty,
    scramble: s.scramble,
    date: s.date,
    ...(s.comment !== undefined ? { comment: s.comment } : {}),
    ...(s.splits && s.splits.length > 0 ? { splits: s.splits } : {}),
    ...(s.event ? { event: s.event } : {}),
    ...(s.reconstruction ? { reconstruction: s.reconstruction } : {}),
    ...(s.heartRate ? { heartRate: s.heartRate } : {}),
    ...(s.crossMs !== undefined ? { crossMs: s.crossMs } : {}),
    ...(s.moveTimestamps && s.moveTimestamps.length > 0 ? { moveTimestamps: s.moveTimestamps } : {}),
    ...(s.rotations ? { rotations: s.rotations } : {}),
    ...(s.orientedReconstruction ? { orientedReconstruction: s.orientedReconstruction } : {}),
    ...(s.gyroStream ? { gyroStream: s.gyroStream } : {}),
    ...(s.cube ? { cube: s.cube } : {}),
    ...(s.repaired ? { repaired: s.repaired } : {}),
  };
}

/** Content without the revision, for telling a same-revision copy apart from a real edit. */
const contentOf = (s: Solve) => contentKey({ ...s, updatedAt: undefined });

export interface ImportPlan {
  /** Rows to write — new ones and newer versions of existing ones. */
  put: Solve[];
  /** Deletion records to drop, for deleted solves the file brings back. */
  restoredIds: string[];
  result: ImportResult;
}

/**
 * Decides, without touching the database, what an import changes. Per row:
 *
 * - Its id is already here (in any session): the newer version wins, by the
 *   same rule sync uses (merge.ts) — the file's copy replaces this one only if
 *   its revision is later, or ties it with different content that sorts
 *   ahead. Otherwise it's skipped. A replaced solve stays in its own session.
 * - Otherwise, a solve in the target session with the same date (to the
 *   second), time and scramble means it's here already under another id
 *   (an id-less csTimer file, or an export from before ids were kept): skipped.
 * - Anything else is added, keeping the file's id when it has one so the next
 *   import of the same file recognises it. A solve deleted here comes back:
 *   importing it is a newer event than the deletion.
 *
 * Rows written get a fresh `updatedAt`, so cloud sync sends them on.
 */
export function planImport(args: {
  sessionId: string;
  rows: readonly ImportRow[];
  /** Rows already here with an id the file mentions, in any session. */
  existing: ReadonlyMap<string, Solve>;
  /** Ids the file mentions that were deleted here. */
  deleted: ReadonlySet<string>;
  /** What the target session already holds. */
  sessionSolves: readonly Pick<Solve, "date" | "timeMs" | "scramble">[];
  now: number;
  makeId: () => string;
}): ImportPlan {
  const { sessionId, existing, deleted, now, makeId } = args;
  const seen = new Set(args.sessionSolves.map(solveFingerprint));
  const claimed = new Set<string>();
  const put: Solve[] = [];
  const restoredIds: string[] = [];
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };

  for (const row of args.rows) {
    const id = row.id;
    // The same id twice in one file: the first copy speaks for it.
    if (id !== undefined && claimed.has(id)) {
      result.skipped++;
      continue;
    }
    const mine = id !== undefined ? existing.get(id) : undefined;
    if (id !== undefined && mine) {
      claimed.add(id);
      const theirs = importedSolve(row, id, mine.sessionId, row.updatedAt ?? row.date);
      const mineRev = solveRevision(mine);
      const theirRev = solveRevision(theirs);
      const newer = theirRev > mineRev || (theirRev === mineRev && contentOf(theirs) > contentOf(mine));
      if (newer) {
        put.push({ ...theirs, updatedAt: Math.max(now, mineRev + 1) });
        result.updated++;
      } else {
        result.skipped++;
      }
      continue;
    }
    const fingerprint = solveFingerprint(row);
    if (seen.has(fingerprint)) {
      result.skipped++;
      continue;
    }
    seen.add(fingerprint);
    if (id !== undefined) {
      claimed.add(id);
      if (deleted.has(id)) restoredIds.push(id);
    }
    put.push(importedSolve(row, id ?? makeId(), sessionId, now));
    result.added++;
  }
  return { put, restoredIds, result };
}

/**
 * Bulk-imports solves into a session, skipping the ones already here (see
 * planImport) — so importing the same file twice adds nothing the second time.
 * One read-write transaction: a bulk read of the ids the file names and of
 * the target session, then one bulk write.
 */
export async function importSolvesWithReport(sessionId: string, solves: readonly ImportRow[]): Promise<ImportResult> {
  return db.transaction("rw", db.solves, db.deletions, async () => {
    const ids = [...new Set(solves.flatMap((s) => (s.id !== undefined ? [s.id] : [])))];
    const [found, gone, sessionSolves] = await Promise.all([
      ids.length ? db.solves.bulkGet(ids) : Promise.resolve([]),
      ids.length ? db.deletions.bulkGet(ids) : Promise.resolve([]),
      db.solves.where("sessionId").equals(sessionId).toArray(),
    ]);
    const existing = new Map<string, Solve>();
    for (const s of found) if (s) existing.set(s.id, s);
    const deleted = new Set<string>();
    for (const d of gone) if (d && d.kind === "solve") deleted.add(d.id);
    const plan = planImport({ sessionId, rows: solves, existing, deleted, sessionSolves, now: Date.now(), makeId: newId });
    if (plan.restoredIds.length) await db.deletions.bulkDelete(plan.restoredIds);
    if (plan.put.length) await db.solves.bulkPut(plan.put);
    return plan.result;
  });
}

/** importSolvesWithReport, counting the solves written (added or updated). */
export async function importSolves(sessionId: string, solves: readonly ImportRow[]): Promise<number> {
  const r = await importSolvesWithReport(sessionId, solves);
  return r.added + r.updated;
}
