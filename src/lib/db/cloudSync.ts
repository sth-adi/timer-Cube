import { getSupabaseClient } from "@/lib/supabase/client";
import { db } from "./db";
import { mergeSyncPayload, type SyncPayload } from "./sync";
import type { Session, Solve } from "@/types";

const SYNC_TIMEOUT_MS = 15_000;

export class SyncTimeoutError extends Error {
  constructor() {
    super("Timed out reaching the server.");
    this.name = "SyncTimeoutError";
  }
}

/**
 * A request that hangs on a bad connection (packet loss, a dying proxy, a
 * dead Wi-Fi handoff) would otherwise leave callers `await`ing forever —
 * observed directly while testing this: a stuck sessions/solves fetch left
 * the sync status frozen on "Syncing…" indefinitely, with no error and no
 * way to recover short of a page reload. Every Supabase call here is bounded
 * so a stuck request always settles, one way or another, within
 * SYNC_TIMEOUT_MS. The real fetch may still be running in the background
 * when this rejects — harmless for a periodic background sync, not worth
 * threading an AbortController through for.
 */
function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SyncTimeoutError()), SYNC_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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
