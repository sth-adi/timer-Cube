import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout, SupabaseTimeoutError } from "@/lib/supabase/withTimeout";
import { db } from "./db";
import { mergeSyncPayload, readLocalState, type MergeResult } from "./sync";
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
  updated_at: number | null;
}

interface DeletionRow {
  user_id: string;
  id: string;
  kind: "solve" | "session";
  deleted_at: number;
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

function check(err: { code?: string; message?: string } | null): void {
  if (!err) return;
  // More specific first: a gyro_stream-shaped error can also match the
  // generic codes isMissingSchema looks at.
  if (isMissingGyroStream(err)) throw new Error(GYRO_STREAM_MIGRATION_NEEDED);
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
    ...(r.updated_at !== null && r.updated_at !== undefined ? { updatedAt: r.updated_at } : {}),
  };
}

/**
 * Pushes this device's state — every session, solve and deletion record —
 * after a pull has merged the cloud's state in (see syncWithCloud), so what
 * goes up is already the merged, most-recent version of everything.
 * Upserts are safe to repeat; and the database itself refuses to let an
 * older version overwrite a newer one or revive a deleted row (the
 * sync_guard trigger in the migration), so a stale device — even one on an
 * older version of this app — can't undo anything.
 */
export async function pushAll(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { sessions, solves, deletions } = await readLocalState();
  if (deletions.length > 0) {
    const rows: DeletionRow[] = deletions.map((d) => ({ user_id: userId, id: d.id, kind: d.kind, deleted_at: d.deletedAt }));
    const { error } = await withTimeout(supabase.from("deletions").upsert(rows, { onConflict: "user_id,id" }));
    check(error);
  }
  if (sessions.length > 0) {
    const { error } = await withTimeout(supabase.from("sessions").upsert(sessions.map((s) => sessionToRow(s, userId))));
    check(error);
  }
  if (solves.length > 0) {
    const { error } = await withTimeout(supabase.from("solves").upsert(solves.map((s) => solveToRow(s, userId))));
    check(error);
  }
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

/**
 * Pulls everything this account has in the cloud — rows and deletion
 * records — and merges it into local storage under the sync rule: the most
 * recent change to each id wins, deletions included (lib/db/merge.ts).
 */
export async function pullAll(userId: string): Promise<MergeResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { addedSessions: 0, addedSolves: 0, updated: 0, removed: 0 };
  const [sessionRes, solveRes, deletionRes] = await Promise.all([
    withTimeout(supabase.from("sessions").select("*").eq("user_id", userId)),
    withTimeout(supabase.from("solves").select("*").eq("user_id", userId)),
    withTimeout(supabase.from("deletions").select("*").eq("user_id", userId)),
  ]);
  check(sessionRes.error);
  check(solveRes.error);
  check(deletionRes.error);
  return mergeSyncPayload({
    sessions: (sessionRes.data ?? []).map((r) => rowToSession(r as SessionRow)),
    solves: (solveRes.data ?? []).map((r) => rowToSolve(r as SolveRow)),
    deletions: (deletionRes.data ?? []).map((r) => {
      const d = r as DeletionRow;
      return { id: d.id, kind: d.kind, deletedAt: d.deleted_at } satisfies Deletion;
    }),
  });
}

/** One full cloud sync: pull and merge first, then push the merged result. */
export async function syncWithCloud(userId: string): Promise<MergeResult> {
  const result = await pullAll(userId);
  await pushAll(userId);
  return result;
}
