import { db, newId } from "./db";
import { contentKey, solveRevision } from "./merge";
import type { EventTag, FullSolve, GyroStream, Penalty, Solve } from "@/types";

/**
 * The in-memory form of a stored row: everything but `gyroStream` (~95% of a smart-cube row's
 * bytes), with `hasGyro` left behind so "does this solve have gyro data?" still answers. Every row
 * the stores hold goes through here, and nothing in memory is ever written back to the database —
 * edits are partial `update`s and undo restores the rows `bulkDeleteSolves` read from disk.
 */
export function slimSolve(row: FullSolve): Solve {
  const { gyroStream, ...rest } = row;
  return gyroStream ? { ...rest, hasGyro: true } : rest;
}

/** Changes an edit may carry: any stored field but the id and the in-memory marker. */
export type SolveChanges = Partial<Omit<FullSolve, "id" | "hasGyro">>;

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
  gyroStream?: GyroStream;
  cube?: Solve["cube"];
  repaired?: Solve["repaired"];
}): Promise<Solve> {
  const solve: FullSolve = {
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
  // The stream is on disk; memory gets the slim row.
  return slimSolve(solve);
}

/** `changes` without the in-memory-only marker, which must never reach the database. */
function storable(changes: SolveChanges): SolveChanges {
  const rest: SolveChanges & { hasGyro?: unknown } = { ...changes };
  delete rest.hasGyro;
  return rest;
}

/**
 * Every edit bumps updatedAt — the revision sync uses to decide which version of a solve wins.
 * Returns the new updatedAt, so a caller can patch its in-memory copy without re-reading the row.
 * A partial `update`: only the named fields are written, so the stored gyro stream and move data
 * are never touched by an edit of something else.
 */
export async function updateSolve(id: string, changes: SolveChanges): Promise<number> {
  const updatedAt = Date.now();
  await db.solves.update(id, { ...storable(changes), updatedAt });
  return updatedAt;
}

/** The same edit on several solves in one transaction, all-or-nothing. Returns the shared updatedAt. */
export async function updateSolvesBulk(ids: string[], changes: SolveChanges): Promise<number> {
  const updatedAt = Date.now();
  const stored = storable(changes);
  await db.transaction("rw", db.solves, async () => {
    for (const id of ids) await db.solves.update(id, { ...stored, updatedAt });
  });
  return updatedAt;
}

/**
 * Puts deleted solves back: removes their deletion records and re-adds the rows
 * with a fresh `updatedAt`, which is what makes the restore win over the
 * deletion on every other device too (the newest change wins — see merge.ts).
 * Takes the rows `bulkDeleteSolves` read from disk — gyro streams and all — and refuses a slimmed
 * in-memory row (one carrying `hasGyro`), which would bring the solve back without its stream.
 * Returns the restored rows slimmed, for memory.
 */
export async function restoreSolves(solves: FullSolve[]): Promise<Solve[]> {
  if (solves.length === 0) return [];
  if (solves.some((s) => "hasGyro" in s)) throw new Error("restoreSolves needs stored rows, not slimmed in-memory ones");
  const now = Date.now();
  const rows: FullSolve[] = solves.map((s) => ({ ...s, updatedAt: Math.max(now, (s.updatedAt ?? 0) + 1) }));
  await db.transaction("rw", db.solves, db.deletions, async () => {
    await db.deletions.bulkDelete(solves.map((s) => s.id));
    await db.solves.bulkPut(rows);
  });
  return rows.map(slimSolve);
}

/** Deletes a solve and records the deletion, so syncing can't bring it back from another device. */
export async function deleteSolve(id: string): Promise<void> {
  await db.transaction("rw", db.solves, db.deletions, async () => {
    await db.solves.delete(id);
    await db.deletions.put({ id, kind: "solve", deletedAt: Date.now() });
  });
}

/**
 * deleteSolve for many ids in one transaction, all-or-nothing: each id gets its deletion record
 * (even one with no row here, as deleteSolve does). Returns the rows that were actually removed,
 * as stored — gyro stream and all, since this is the only copy once they are gone — for undo.
 */
export async function bulkDeleteSolves(ids: string[]): Promise<FullSolve[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return db.transaction("rw", db.solves, db.deletions, async () => {
    const removed = (await db.solves.bulkGet(unique)).filter((s): s is FullSolve => !!s);
    const deletedAt = Date.now();
    await db.solves.bulkDelete(unique);
    await db.deletions.bulkPut(unique.map((id) => ({ id, kind: "solve" as const, deletedAt })));
    return removed;
  });
}

/**
 * The session's solves, oldest first, slimmed one row at a time as the cursor goes — a whole
 * history of full rows is never in memory at once. Use getFullSolve(s) for the gyro streams.
 */
export async function getSessionSolves(sessionId: string): Promise<Solve[]> {
  const rows: Solve[] = [];
  await db.solves
    .where("sessionId")
    .equals(sessionId)
    .each((row) => void rows.push(slimSolve(row)));
  // The sort is stable, so equal dates keep the order sortBy("date") gave them.
  return rows.sort((a, b) => a.date - b.date);
}

/**
 * Every solve across every session, oldest first — the basis for lifetime achievements/streaks/
 * goals — slimmed one row at a time as the cursor goes (see getSessionSolves).
 */
export async function getAllSolves(): Promise<Solve[]> {
  const rows: Solve[] = [];
  await db.solves.orderBy("date").each((row) => void rows.push(slimSolve(row)));
  return rows;
}

/** A session's solves exactly as stored, oldest first — gyro streams included — for an export. Reads straight from the database, never from the in-memory (slim) rows. */
export async function getFullSessionSolves(sessionId: string): Promise<FullSolve[]> {
  return db.solves.where("sessionId").equals(sessionId).sortBy("date");
}

/** One solve exactly as stored, gyro stream included — for the screens that play or analyse a single solve. */
export async function getFullSolve(id: string): Promise<FullSolve | undefined> {
  return db.solves.get(id);
}

/** A solve's gyro stream, read from the stored row; undefined when it has none (or the row is gone). */
export async function getSolveStreams(id: string): Promise<GyroStream | undefined> {
  return (await db.solves.get(id))?.gyroStream;
}

/** The stored rows for `ids` in one read, in the same order; undefined where a row is gone. */
export async function getFullSolves(ids: string[]): Promise<(FullSolve | undefined)[]> {
  return ids.length ? db.solves.bulkGet(ids) : [];
}

/** How many full rows a chunked read holds at once. */
export const FULL_CHUNK = 50;

/**
 * Reads the stored rows for `ids` (full, gyro stream included) a chunk at a time and hands each chunk
 * to `onChunk`, yielding to the event loop between chunks so a page of thousands of solves keeps
 * painting. Only one chunk of full rows is alive at a time: `onChunk` should keep what it derives, not
 * the rows. Stops early when `signal` aborts. Rows that have vanished since `ids` was made are skipped.
 */
export async function forEachFullSolveChunk(
  ids: readonly string[],
  onChunk: (rows: FullSolve[], done: number, total: number) => void,
  opts: { chunkSize?: number; signal?: { aborted: boolean } } = {},
): Promise<void> {
  const size = Math.max(1, opts.chunkSize ?? FULL_CHUNK);
  for (let i = 0; i < ids.length; i += size) {
    if (opts.signal?.aborted) return;
    const rows = (await db.solves.bulkGet(ids.slice(i, i + size))).filter((r): r is FullSolve => !!r);
    if (opts.signal?.aborted) return;
    onChunk(rows, Math.min(i + size, ids.length), ids.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
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
export type ImportRow = Omit<FullSolve, "id" | "sessionId" | "updatedAt"> & { id?: string; updatedAt?: number };

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

function importedSolve(s: ImportRow, id: string, sessionId: string, updatedAt: number): FullSolve {
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

/** What a smart cube recorded during a solve: an import that lacks it never erases it from a solve already here. */
const RECORDED_FIELDS = ["gyroStream", "moveTimestamps", "rotations", "orientedReconstruction"] as const;

/** Content without the revision, for telling a same-revision copy apart from a real edit. */
const contentOf = (s: FullSolve) => contentKey({ ...s, updatedAt: undefined });

export interface ImportPlan {
  /** Rows to write — new ones and newer versions of existing ones. */
  put: FullSolve[];
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
  existing: ReadonlyMap<string, FullSolve>;
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
  const put: FullSolve[] = [];
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
        // The file's copy wins, but never by dropping what this device recorded and the file lacks
        // (an older or csTimer-style file carries no gyro data or turn times): same solve, same data.
        const kept: Pick<FullSolve, (typeof RECORDED_FIELDS)[number]> = {};
        for (const field of RECORDED_FIELDS) if (theirs[field] === undefined && mine[field] !== undefined) Object.assign(kept, { [field]: mine[field] });
        put.push({ ...theirs, ...kept, updatedAt: Math.max(now, mineRev + 1) });
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
    const existing = new Map<string, FullSolve>();
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
