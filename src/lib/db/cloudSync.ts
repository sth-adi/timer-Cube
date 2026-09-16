import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout, SupabaseTimeoutError } from "@/lib/supabase/withTimeout";
import { db } from "./db";
import { mergeSyncPayload, type SyncPayload } from "./sync";
import { computeSessionStats } from "@/lib/stats/stats";
import type { Session, Solve } from "@/types";

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
}

function sessionToRow(s: Session, userId: string): SessionRow {
  return { id: s.id, user_id: userId, name: s.name, event: s.event, created_at: s.createdAt, order: s.order };
}

function rowToSession(r: SessionRow): Session {
  return { id: r.id, name: r.name, event: r.event as Session["event"], createdAt: r.created_at, order: r.order };
}

function solveToRow(s: Solve, userId: string): SolveRow {
  return {
    id: s.id,
    user_id: userId,
    session_id: s.sessionId,
    time_ms: s.timeMs,
    penalty: s.penalty,
    scramble: s.scramble,
    date: s.date,
    comment: s.comment ?? null,
    splits: s.splits ?? null,
    event: s.event ?? null,
    reconstruction: s.reconstruction ?? null,
    heart_rate: s.heartRate ?? null,
    cross_ms: s.crossMs ?? null,
    move_timestamps: s.moveTimestamps ?? null,
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
  };
}

/**
 * Pushes every local session/solve to the account's cloud tables. Plain
 * upserts keyed by id, so calling this repeatedly (every solve, every
 * reconnect) is cheap and idempotent — the remote row always ends up
 * matching whatever this device last had locally.
 */
export async function pushAll(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const [sessions, solves] = await Promise.all([db.sessions.toArray(), db.solves.toArray()]);
  if (sessions.length > 0) {
    const { error } = await withTimeout(supabase.from("sessions").upsert(sessions.map((s) => sessionToRow(s, userId))));
    if (error) throw error;
  }
  if (solves.length > 0) {
    const { error } = await withTimeout(supabase.from("solves").upsert(solves.map((s) => solveToRow(s, userId))));
    if (error) throw error;
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
  const { error } = await withTimeout(
    supabase.from("public_stats").upsert({
      user_id: userId,
      username,
      best_single_ms: stats.best,
      best_ao5_ms: stats.bestAo5,
      best_ao12_ms: stats.bestAo12,
      total_solves: stats.solveCount,
    }),
  );
  if (error) throw error;
}

/**
 * Pulls everything this account has in the cloud and merges it into local
 * storage — additive only, same semantics as the existing device-to-device
 * WebRTC sync (lib/db/sync.ts): a row that already exists locally is left
 * exactly as it is, so a stale or older remote copy can never clobber an
 * edit made on this device since the last sync. Deletions likewise don't
 * propagate either direction, matching that same existing tradeoff.
 */
export async function pullAll(userId: string): Promise<{ addedSessions: number; addedSolves: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { addedSessions: 0, addedSolves: 0 };
  const [{ data: sessionRows, error: sessionErr }, { data: solveRows, error: solveErr }] = await Promise.all([
    withTimeout(supabase.from("sessions").select("*").eq("user_id", userId)),
    withTimeout(supabase.from("solves").select("*").eq("user_id", userId)),
  ]);
  if (sessionErr) throw sessionErr;
  if (solveErr) throw solveErr;
  const payload: SyncPayload = {
    sessions: (sessionRows ?? []).map((r) => rowToSession(r as SessionRow)),
    solves: (solveRows ?? []).map((r) => rowToSolve(r as SolveRow)),
  };
  return mergeSyncPayload(payload);
}
