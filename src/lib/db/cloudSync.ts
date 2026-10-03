import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout, SupabaseTimeoutError } from "@/lib/supabase/withTimeout";
import { db } from "./db";
import { mergeSyncPayload, readLocalState, type MergeResult } from "./sync";
import { withLocalOnlyFields } from "./merge";
import { computeSessionStats } from "@/lib/stats/stats";
import type { Deletion, Session, Solve } from "@/types";

// Kept as a re-export so existing imports of SyncTimeoutError from here (cloudSyncStore.ts) don't need to change.
export { SupabaseTimeoutError as SyncTimeoutError };

/**
 * Row shapes as stored in Supabase (snake_case, one extra `user_id` column
 * for RLS) vs. this app's own camelCase local types.
 */
interface SessionRow {
  id: string;
  user_id: string;
  name: string;
  event: string;
  created_at: number;
  order: number;
  updated_at: number | null;
  /** Server clock, set by a trigger on every write; absent until 20261004000000_solve_cube_repaired.sql is applied. */
  synced_at?: string;
}

interface SolveRow {
  id: string;
  user_id: string;
  session_id: string;
  time_ms: number;
  penalty: string;
  scramble: string;
  date: number;
  comment: string | null;
  splits: number[] | null;
  event: string | null;
  reconstruction: string | null;
  heart_rate: { avg: number; max: number } | null;
  cross_ms: number | null;
  move_timestamps: number[] | null;
  rotations: { atMs: number; token: string }[] | null;
  oriented_reconstruction: string | null;
  gyro_stream: { atMs: number[]; qx: number[]; qy: number[]; qz: number[]; qw: number[] } | null;
  /** Absent from a cloud that hasn't had 20261004000000_solve_cube_repaired.sql applied yet. */
  cube?: NonNullable<Solve["cube"]> | null;
  repaired?: NonNullable<Solve["repaired"]> | null;
  updated_at: number | null;
  synced_at?: string;
}

interface DeletionRow {
  user_id: string;
  id: string;
  kind: "solve" | "session";
  deleted_at: number;
  synced_at?: string;
}

/**
 * Shown when the Supabase project hasn't had the sync-revisions migration
 * applied (no `deletions` table / `updated_at` columns yet). Syncing without
 * them would bring back the old problems — deletions undone, edits lost —
 * so it stops with instructions instead.
 */
export const MIGRATION_NEEDED =
  "Cloud sync needs a one-time database update: run supabase/migrations/20260923000000_sync_revisions.sql in your Supabase project's SQL editor, then sync again.";

/**
 * Shown when specifically the gyro-stream column is missing — a separate,
 * later, optional migration from the one above. Checked by message content
 * rather than error code: the codes below are generic ("a column is
 * missing"), so a code-only check can't tell *which* migration to point at,
 * and pointing someone back at a migration they already ran would be worse
 * than useless.
 */
export const GYRO_STREAM_MIGRATION_NEEDED =
  "Cloud sync needs one more database update, for the gyro stream: run supabase/migrations/20260925000000_gyro_stream.sql in your Supabase project's SQL editor, then sync again.";

/**
 * Same idea for the cube/repaired columns, the last optional migration. Both
 * the Postgres ("column \"cube\" of relation…") and PostgREST ("Could not find
 * the 'cube' column…") messages quote the column name.
 */
export const SOLVE_CUBE_MIGRATION_NEEDED =
  "Cloud sync needs one more database update, for each solve's cube: run supabase/migrations/20261004000000_solve_cube_repaired.sql in your Supabase project's SQL editor, then sync again.";

function isMissingSchema(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST204" ||
    err.code === "PGRST205" ||
    /updated_at|deletions|rotations|oriented_reconstruction/.test(err.message ?? "")
  );
}

function isMissingGyroStream(err: { code?: string; message?: string } | null): boolean {
  return !!err && /gyro_stream/.test(err.message ?? "");
}

function isMissingCubeColumns(err: { code?: string; message?: string } | null): boolean {
  return !!err && /["'](cube|repaired)["']/.test(err.message ?? "");
}

function check(err: { code?: string; message?: string } | null): void {
  if (!err) return;
  // More specific first: a gyro_stream- or cube-shaped error can also match
  // the generic codes isMissingSchema looks at.
  if (isMissingGyroStream(err)) throw new Error(GYRO_STREAM_MIGRATION_NEEDED);
  if (isMissingCubeColumns(err)) throw new Error(SOLVE_CUBE_MIGRATION_NEEDED);
  if (isMissingSchema(err)) throw new Error(MIGRATION_NEEDED);
  throw err;
}

function sessionToRow(s: Session, userId: string): SessionRow {
  return { id: s.id, user_id: userId, name: s.name, event: s.event, created_at: s.createdAt, order: s.order, updated_at: s.updatedAt ?? null };
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    name: r.name,
    event: r.event as Session["event"],
    createdAt: r.created_at,
    order: r.order,
    ...(r.updated_at !== null && r.updated_at !== undefined ? { updatedAt: r.updated_at } : {}),
  };
}

function solveToRow(s: Solve, userId: string): SolveRow {
  return {
    id: s.id,
    user_id: userId,
    session_id: s.sessionId,
    // `time_ms`/`cross_ms` are Postgres `integer` columns. Solve timing is
    // ultimately derived from performance.now() (sub-millisecond-precision,
    // a float) — useTimer.ts rounds at capture time, but this is a second,
    // defensive line for whatever's already sitting in a device's local
    // Dexie store from before that fix, or from a path that doesn't (smart
    // cube live capture). An unrounded value here fails the upsert outright
    // with "invalid input syntax for type integer" — this is exactly the
    // bug a user hit syncing from a device with an old fractional solve.
    time_ms: Math.round(s.timeMs),
    penalty: s.penalty,
    scramble: s.scramble,
    date: s.date,
    comment: s.comment ?? null,
    splits: s.splits ?? null,
    event: s.event ?? null,
    reconstruction: s.reconstruction ?? null,
    heart_rate: s.heartRate ?? null,
    cross_ms: s.crossMs !== undefined ? Math.round(s.crossMs) : null,
    move_timestamps: s.moveTimestamps ?? null,
    rotations: s.rotations ?? null,
    oriented_reconstruction: s.orientedReconstruction ?? null,
    gyro_stream: s.gyroStream ?? null,
    cube: s.cube ?? null,
    repaired: s.repaired ?? null,
    updated_at: s.updatedAt ?? null,
  };
}

function rowToSolve(r: SolveRow): Solve {
  return {
    id: r.id,
    sessionId: r.session_id,
    timeMs: r.time_ms,
    penalty: r.penalty as Solve["penalty"],
    scramble: r.scramble,
    date: r.date,
    ...(r.comment ? { comment: r.comment } : {}),
    ...(r.splits ? { splits: r.splits } : {}),
    ...(r.event ? { event: r.event as Solve["event"] } : {}),
    ...(r.reconstruction ? { reconstruction: r.reconstruction } : {}),
    ...(r.heart_rate ? { heartRate: r.heart_rate } : {}),
    ...(r.cross_ms !== null ? { crossMs: r.cross_ms } : {}),
    ...(r.move_timestamps ? { moveTimestamps: r.move_timestamps } : {}),
    ...(r.rotations ? { rotations: r.rotations } : {}),
    ...(r.oriented_reconstruction ? { orientedReconstruction: r.oriented_reconstruction } : {}),
    ...(r.gyro_stream ? { gyroStream: r.gyro_stream } : {}),
    ...(r.cube ? { cube: r.cube } : {}),
    ...(r.repaired ? { repaired: r.repaired } : {}),
    ...(r.updated_at !== null && r.updated_at !== undefined ? { updatedAt: r.updated_at } : {}),
  };
}

/** Rows per request are capped by serialized size so none runs long enough to hit the server's statement timeout. */
const CHUNK_BYTES = 400_000;
const CHUNK_ROWS = 40;
/** Re-send a little before the last push, so a clock that's slightly off never skips a change. */
const PUSH_SLACK_MS = 60_000;
/**
 * A pull re-fetches from this long before the newest `synced_at` it has seen, not from it: the
 * server stamps a row when its transaction starts, so one that commits late can land behind a row
 * that committed earlier.
 */
const PULL_SLACK_MS = 2 * 60_000;
/** A safety net only (a restored database backup, a dropped trigger): incremental pulls are exact in normal use. */
const FULL_PULL_EVERY_MS = 7 * 86_400_000;

export function chunkBySize<T>(rows: T[]): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (current.length > 0 && (bytes + size > CHUNK_BYTES || current.length >= CHUNK_ROWS)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const pushedAtKey = (userId: string) => `cube-timer-cloud-pushed-at:${userId}`;
const pullMarkKey = (userId: string) => `cube-timer-cloud-synced-mark:${userId}`;
const fullPullAtKey = (userId: string) => `cube-timer-cloud-full-pull-at:${userId}`;

/** How many solves haven't been sent to the cloud yet (new or edited since the last complete push). */
export function countUnpushed(userId: string, solves: readonly Solve[]): number {
  const since = readPushedAt(userId) - PUSH_SLACK_MS;
  return solves.reduce((n, s) => ((s.updatedAt ?? s.date) > since ? n + 1 : n), 0);
}

function readStoredNumber(key: string): number {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeStoredNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Without them every sync just re-sends and re-downloads everything (in chunks) — slower, still correct.
  }
}

const readPushedAt = (userId: string) => readStoredNumber(pushedAtKey(userId));
const writePushedAt = (userId: string, at: number) => writeStoredNumber(pushedAtKey(userId), at);

// --- Whose solves are on this device ----------------------------------------
//
// Signing out keeps everything on the device, and a sync uploads everything on the device. Without
// knowing whose solves those are, signing in as someone else would copy the last account's whole
// history into the new one. So the device remembers which account its data belongs to, and a
// different account signing in is asked first instead of synced.

const DATA_OWNER_KEY = "cube-timer:data-owner";
const DATA_OWNER_NAME_KEY = "cube-timer:data-owner-name";
/** Set when the signed-in account chose not to sync this device; holds the owner it was chosen for. */
const keptLocalKey = (userId: string) => `cube-timer:kept-local:${userId}`;
const PUSHED_AT_PREFIX = pushedAtKey("");

/**
 * Which account this device's data belongs to. The stored owner when there is one; otherwise (data
 * from before owners were recorded) whoever this device last pushed for, read off the per-account
 * push marks — the account signing in, if it has pushed from here before; null when nobody has,
 * meaning the data was never anyone's.
 */
export function resolveDataOwner(stored: string | null, pushedAt: Readonly<Record<string, number>>, userId: string): string | null {
  if (stored) return stored;
  if ((pushedAt[userId] ?? 0) > 0) return userId;
  let owner: string | null = null;
  let latest = 0;
  for (const [id, at] of Object.entries(pushedAt)) {
    if (id && at > latest) {
      owner = id;
      latest = at;
    }
  }
  return owner;
}

/**
 * - `sync`: the data is this account's, nobody's yet, or there are no solves to carry over.
 * - `ask`: it belongs to another account — nothing is pulled or pushed until the user chooses.
 * - `kept-local`: they already chose to keep it on this device without syncing this account.
 */
export type OwnershipDecision = { kind: "sync" } | { kind: "ask"; ownerId: string } | { kind: "kept-local"; ownerId: string };

export function decideOwnership(input: {
  userId: string;
  ownerId: string | null;
  localSolves: number;
  /** The owner this account chose "keep on this device" for, if it did. */
  keptLocalFor: string | null;
}): OwnershipDecision {
  const { userId, ownerId, localSolves, keptLocalFor } = input;
  if (ownerId === null || ownerId === userId || localSolves === 0) return { kind: "sync" };
  if (keptLocalFor === ownerId) return { kind: "kept-local", ownerId };
  return { kind: "ask", ownerId };
}

function readStoredString(key: string): string | null {
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function readPushedAtMarks(): Record<string, number> {
  const marks: Record<string, number> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PUSHED_AT_PREFIX)) marks[key.slice(PUSHED_AT_PREFIX.length)] = readStoredNumber(key);
    }
  } catch {
    // Unreadable storage: no legacy marks to go by.
  }
  return marks;
}

export interface DataOwnership {
  decision: OwnershipDecision;
  /** The owner's username when it was recorded (null for data from before names were kept). */
  ownerName: string | null;
  localSolves: number;
}

/** Whether `userId` may sync this device's data now (see decideOwnership). */
export async function checkDataOwnership(userId: string): Promise<DataOwnership> {
  const stored = readStoredString(DATA_OWNER_KEY);
  const ownerId = resolveDataOwner(stored, readPushedAtMarks(), userId);
  const localSolves = await db.solves.count();
  const decision = decideOwnership({ userId, ownerId, localSolves, keptLocalFor: readStoredString(keptLocalKey(userId)) });
  // A name is only known for an owner recorded by claimLocalData.
  const ownerName = stored && stored === ownerId ? readStoredString(DATA_OWNER_NAME_KEY) : null;
  return { decision, ownerName, localSolves };
}

/** Records this device's data as `userId`'s — done just before every sync it's allowed, since the pull merges that account's data in. */
export function claimLocalData(userId: string, username: string): void {
  try {
    window.localStorage.setItem(DATA_OWNER_KEY, userId);
    window.localStorage.setItem(DATA_OWNER_NAME_KEY, username);
    window.localStorage.removeItem(keptLocalKey(userId));
  } catch {
    // Without storage the owner can't be remembered; every account then counts as the first.
  }
}

/** `userId` chose to keep `ownerId`'s data on this device without syncing it: not asked again until they change their mind. */
export function keepLocalDataOffAccount(userId: string, ownerId: string): void {
  try {
    window.localStorage.setItem(keptLocalKey(userId), ownerId);
  } catch {
    // Not remembered: they're simply asked again next time.
  }
}

/**
 * Where an incremental pull starts: rows the server stamped (`synced_at`) after this, in epoch ms.
 * Null means a full pull — the first sync, a missing mark (or push mark, which would make the push
 * resend everything), or a full pull over a week ago or stamped in the future (the clock moved back).
 * The mark itself is server time, so it is never compared with this device's clock.
 */
export function pullSince(mark: number, fullPullAt: number, pushedAt: number, now: number): number | null {
  if (mark <= 0 || fullPullAt <= 0 || pushedAt <= 0) return null;
  if (fullPullAt > now || now - fullPullAt > FULL_PULL_EVERY_MS) return null;
  return mark - PULL_SLACK_MS;
}

/** The newest `synced_at` (epoch ms) among pulled rows; 0 when there are none or the cloud doesn't stamp rows yet. */
export function newestSyncedAt(...tables: readonly (readonly { synced_at?: string }[])[]): number {
  let max = 0;
  for (const rows of tables) {
    for (const r of rows) {
      const at = r.synced_at ? Date.parse(r.synced_at) : NaN;
      if (Number.isFinite(at) && at > max) max = at;
    }
  }
  return max;
}

/**
 * Pushes this device's state — every session, solve and deletion record —
 * after a pull has merged the cloud's state in (see syncWithCloud), so what
 * goes up is already the merged, most-recent version of everything.
 * Upserts are safe to repeat; and the database itself refuses to let an
 * older version overwrite a newer one or revive a deleted row (the
 * sync_guard trigger in the migration), so a stale device — even one on an
 * older version of this app — can't undo anything.
 *
 * `cloudRevisions` is what the pull just downloaded; `cloudComplete` says whether that was every
 * row (a full pull) or only the recent ones.
 */
export async function pushAll(userId: string, cloudRevisions?: ReadonlyMap<string, number>, cloudComplete = true): Promise<void> {
  const startedAt = Date.now();
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { sessions, solves, deletions } = await readLocalState();
  if (sessions.length > 0) {
    const { error } = await withTimeout(supabase.from("sessions").upsert(sessions.map((s) => sessionToRow(s, userId))));
    check(error);
  }
  // Only what changed since the last complete push — a smart-cube solve carries a per-move (and
  // possibly gyro) stream, so the whole history is megabytes, and sending it as one request runs
  // past the database's statement timeout (HTTP 500) and sync never finishes.
  // Straight after a full pull, the cloud's own revision of each solve is known exactly: only what's new or
  // changed here needs sending (a new device would otherwise upload everything it just downloaded).
  // After a partial pull that holds only for the rows it brought; the rest go by the push mark.
  const since = readPushedAt(userId);
  const sinceSlack = since - PUSH_SLACK_MS;
  const pending = !cloudRevisions
    ? solves.filter((s) => (s.updatedAt ?? s.date) > sinceSlack)
    : cloudComplete
      ? solves.filter((s) => cloudRevisions.get(s.id) !== (s.updatedAt ?? s.date))
      : solves.filter((s) => (s.updatedAt ?? s.date) > sinceSlack && cloudRevisions.get(s.id) !== (s.updatedAt ?? s.date));
  const rows = pending.map((s) => solveToRow(s, userId));
  for (const chunk of chunkBySize(rows)) {
    const { error } = await withTimeout(supabase.from("solves").upsert(chunk), 30_000);
    check(error);
  }
  // Deletions go last. A session's deletion removes, in the cloud, every solve still filed under it —
  // so solves moved out of it (a merge) must arrive under their new session first.
  // Only the recent ones, same as solves: older records were sent by an earlier complete push.
  const recentDeletions = deletions.filter((d) => d.deletedAt > sinceSlack);
  if (recentDeletions.length > 0) {
    const rows: DeletionRow[] = recentDeletions.map((d) => ({ user_id: userId, id: d.id, kind: d.kind, deleted_at: d.deletedAt }));
    const { error } = await withTimeout(supabase.from("deletions").upsert(rows, { onConflict: "user_id,id" }));
    check(error);
  }
  writePushedAt(userId, startedAt);
}

/**
 * Publishes a lightweight, non-identifying summary (best single/ao5/ao12,
 * total solve count — never scrambles, comments, or reconstructions) to a
 * separate publicly-readable table, keyed by username rather than raw solve
 * history. This is what powers rival lookups (lib/social/rival.ts) — an RLS
 * policy that opened up the real `solves`/`sessions` tables for cross-user
 * reads would leak everything, whereas this one row per user is the only
 * thing anyone else's client can ever see.
 */
export async function pushPublicStats(userId: string, username: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const solves = await db.solves.toArray();
  const stats = computeSessionStats(solves);
  // best_ao5_ms/best_ao12_ms are averages — genuinely fractional by
  // construction even when every underlying solve is a clean integer
  // (e.g. an odd sum divided by 3) — and best_single_ms inherits whatever
  // Math.min() found among possibly-unrounded historical solves. All three
  // are Postgres `integer` columns; round or this upsert fails outright.
  const roundOrNull = (ms: number | null) => (ms === null ? null : Math.round(ms));
  const { error } = await withTimeout(
    supabase.from("public_stats").upsert({
      user_id: userId,
      username,
      best_single_ms: roundOrNull(stats.best),
      best_ao5_ms: roundOrNull(stats.bestAo5),
      best_ao12_ms: roundOrNull(stats.bestAo12),
      total_solves: stats.solveCount,
    }),
  );
  if (error) throw error;
}

/** Thrown by an incremental fetch when the cloud has no `synced_at` column (the migration isn't applied, or was rolled back). */
class SyncedAtMissing extends Error {}

/**
 * Pulls what this account has in the cloud — rows and deletion records — and merges it into local
 * storage under the sync rule: the most recent change to each id wins, deletions included
 * (lib/db/merge.ts).
 *
 * Only the first pull, and one a week after that, takes everything. Between them a pull asks for
 * what the server stamped (`synced_at`, set by a trigger on every write) after the newest stamp
 * seen, less PULL_SLACK_MS. The stamp is the server's clock at the time a device uploaded, not the
 * revision the device gave the row, so solves recorded offline hours ago and uploaded now are
 * picked up too. That is safe because a row missing from the pull is "no information" to the
 * merge, never a deletion (incrementalPull.test.ts). A cloud without the column falls back to a
 * full pull every time.
 */
export async function pullAll(userId: string): Promise<{ result: MergeResult; cloudRevisions: Map<string, number>; complete: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { result: { addedSessions: 0, addedSolves: 0, updated: 0, removed: 0 }, cloudRevisions: new Map(), complete: true };
  const startedAt = Date.now();
  const mark = readStoredNumber(pullMarkKey(userId));
  let since = pullSince(mark, readStoredNumber(fullPullAtKey(userId)), readPushedAt(userId), startedAt);
  const fetchAll = (from: number | null) =>
    Promise.all([
      fetchAllRows<SessionRow>(userId, "sessions", 500, from),
      // Solves carry per-move (and sometimes gyro) streams — a few KB to a few hundred KB each — so they come in small pages.
      fetchAllRows<SolveRow>(userId, "solves", 60, from),
      fetchAllRows<DeletionRow>(userId, "deletions", 1000, from),
    ]);
  let pulled;
  try {
    pulled = await fetchAll(since);
  } catch (err) {
    if (!(err instanceof SyncedAtMissing)) throw err;
    since = null;
    pulled = await fetchAll(null);
  }
  const [sessionRows, solveRows, deletionRows] = pulled;
  const result = await mergeSyncPayload({
    sessions: sessionRows.map(rowToSession),
    solves: withLocalOnlyFields(solveRows.map(rowToSolve), await db.solves.toArray()),
    deletions: deletionRows.map((d) => ({ id: d.id, kind: d.kind, deletedAt: d.deleted_at }) satisfies Deletion),
  });
  // Stays 0 (so every pull is a full one) while the cloud sends no `synced_at`.
  const newest = newestSyncedAt(sessionRows, solveRows, deletionRows);
  writeStoredNumber(pullMarkKey(userId), since === null ? newest : Math.max(mark, newest));
  if (since === null) writeStoredNumber(fullPullAtKey(userId), startedAt);
  return { result, cloudRevisions: new Map(solveRows.map((r) => [r.id, r.updated_at ?? r.date])), complete: since === null };
}

/**
 * The rows this account has in `table` (only those stamped after `since` ms, when given), fetched a
 * page at a time. One request for everything hit two limits: the server caps a response at 1000
 * rows (silently dropping the rest of a long history), and a multi-megabyte body over a phone
 * connection outran the request timeout — so a new device never finished its first pull. Pages
 * continue after the last id seen rather than at an offset, so a row written meanwhile can't shift
 * the next page and skip or repeat one.
 */
async function fetchAllRows<T extends { id: string }>(
  userId: string,
  table: "sessions" | "solves" | "deletions",
  pageSize: number,
  since: number | null,
): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const sinceIso = since === null ? null : new Date(since).toISOString();
  const out: T[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = supabase.from(table).select("*").eq("user_id", userId);
    if (sinceIso !== null) query = query.gt("synced_at", sinceIso);
    if (lastId !== null) query = query.gt("id", lastId);
    const res = await withTimeout(query.order("id").limit(pageSize), 30_000);
    // Before check(): a missing column's error would otherwise be read as "run the sync-revisions migration".
    if (sinceIso !== null && /synced_at/.test(res.error?.message ?? "")) throw new SyncedAtMissing();
    check(res.error);
    const rows = (res.data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
    lastId = rows[rows.length - 1].id;
  }
}

/** Thrown by syncWithCloud when this device's data belongs to another account and the user hasn't said what to do with it. */
export class DataOwnerMismatchError extends Error {}

/**
 * One cloud sync: pull and merge first, then push the merged result. Refuses outright while the
 * device holds another account's solves (the caller asks the user first; see checkDataOwnership).
 */
export async function syncWithCloud(userId: string): Promise<MergeResult> {
  if ((await checkDataOwnership(userId)).decision.kind !== "sync") {
    throw new DataOwnerMismatchError("This device's solves belong to another account. Choose what to do with them before syncing.");
  }
  const { result, cloudRevisions, complete } = await pullAll(userId);
  await pushAll(userId, cloudRevisions, complete);
  return result;
}
