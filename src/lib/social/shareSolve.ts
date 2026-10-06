import { getSupabaseClient } from "@/lib/supabase/client";
import { SupabaseTimeoutError, withTimeout } from "@/lib/supabase/withTimeout";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";

/**
 * Publishing one solve to a shareable /solve/[id] link — a friend with no
 * account can open it and get the same reconstruction replay + stats view
 * the owner sees in the analyzer, computed client-side on their end from
 * just these fields (see analyzeSolve in lib/analysis/analyze.ts). Modeled
 * on race_rooms' anonymous, id-keyed table (see raceSignaling.ts) rather
 * than public_stats' aggregate-only pattern, since a shared solve needs the
 * actual scramble/reconstruction, not a rollup — but unlike a race room
 * this isn't ephemeral, so there's no max-age/expiry here.
 */

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no 0/O/1/I/l — avoids visual ambiguity if ever read aloud or hand-copied
const ID_LENGTH = 10;

function randomId(): string {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return id;
}

export interface SharedSolve {
  scramble: string;
  reconstruction: string;
  timeMs: number;
  moveTimestamps: number[] | null;
  puzzle: string;
  event: string | null;
  username: string | null;
  /** The cube's recorded orientation through the solve, when the sharer's cube had a gyro — lets the shared replay show the Gyro Twin. */
  gyroStream?: GyroStreamData | null;
}

/**
 * A gyro stream read back from the table, or null if it isn't one: arrays of numbers, all the same
 * length, at least two samples. A shared row is public input, so what the replay draws from it is checked first.
 */
export function readGyroStream(value: unknown): GyroStreamData | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const keys = ["atMs", "qx", "qy", "qz", "qw"] as const;
  const arrays = keys.map((k) => v[k]);
  if (!arrays.every((a): a is number[] => Array.isArray(a) && a.every((n) => typeof n === "number" && Number.isFinite(n)))) return null;
  const [atMs, qx, qy, qz, qw] = arrays as number[][];
  if (atMs.length < 2 || [qx, qy, qz, qw].some((a) => a.length !== atMs.length)) return null;
  return { atMs, qx, qy, qz, qw };
}

/** True when a Supabase error is about the gyro_stream column not being there (a host that hasn't run that migration). */
function isMissingGyroColumn(error: unknown): boolean {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  return /gyro_stream/i.test(message);
}

/** Publishes a solve under a fresh id, retrying on the vanishingly rare id collision. Returns null if Supabase isn't reachable. */
export async function createSharedSolve(input: SharedSolve): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomId();
    const row = {
      id,
      scramble: input.scramble,
      reconstruction: input.reconstruction,
      time_ms: Math.round(input.timeMs),
      move_timestamps: input.moveTimestamps,
      puzzle: input.puzzle,
      event: input.event,
      username: input.username,
    };
    const insert = (values: Record<string, unknown>) =>
      withTimeout(supabase.from("shared_solves").insert(values)).catch((e) => ({ error: e as unknown }));
    let { error } = await insert(input.gyroStream ? { ...row, gyro_stream: input.gyroStream } : row);
    // A host without the gyro migration still shares the solve, just without the orientation.
    if (error && input.gyroStream && isMissingGyroColumn(error)) ({ error } = await insert(row));
    if (!error) return id;
  }
  return null;
}

/** Why a lookup produced no solve — the page words each one differently (only "not-found" blames the link). */
export type SharedSolveFailure = "not-found" | "offline" | "timeout" | "error";

export type SharedSolveResult = { ok: true; solve: SharedSolve } | { ok: false; reason: SharedSolveFailure };

type SharedSolveRow = Record<string, unknown>;

/** True when the browser reports no network at all (unknown, e.g. on the server, counts as online). */
function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Turns what the query gave back into a result: a row is a solve, a clean
 * "no row" is the only not-found, and a thrown error or a Supabase error is a
 * failure of the trip, not of the link — offline when the browser says so,
 * otherwise timeout (our own withTimeout fired) or a generic error.
 */
export function mapSharedSolveResponse(response: { data: SharedSolveRow | null; error?: unknown } | { thrown: unknown }, offline = browserOffline()): SharedSolveResult {
  if ("thrown" in response || response.error) {
    if (offline) return { ok: false, reason: "offline" };
    const cause = "thrown" in response ? response.thrown : response.error;
    return { ok: false, reason: cause instanceof SupabaseTimeoutError ? "timeout" : "error" };
  }
  const data = response.data;
  if (!data) return { ok: false, reason: "not-found" };
  return {
    ok: true,
    solve: {
      scramble: data.scramble as string,
      reconstruction: data.reconstruction as string,
      timeMs: data.time_ms as number,
      moveTimestamps: (data.move_timestamps as number[] | null) ?? null,
      puzzle: data.puzzle as string,
      event: (data.event as string | null) ?? null,
      username: (data.username as string | null) ?? null,
      gyroStream: readGyroStream(data.gyro_stream),
    },
  };
}

/** The recipient's lookup — says why when there's no solve, so a dead connection isn't reported as a bad link. */
export async function fetchSharedSolve(id: string): Promise<SharedSolveResult> {
  const supabase = getSupabaseClient();
  // No cloud sharing configured on this host: nothing to retry, but not the link's fault either.
  if (!supabase) return { ok: false, reason: browserOffline() ? "offline" : "error" };
  try {
    const read = (columns: string) => withTimeout(supabase.from("shared_solves").select(columns).eq("id", id).maybeSingle());
    const base = "scramble, reconstruction, time_ms, move_timestamps, puzzle, event, username";
    let { data, error } = await read(`${base}, gyro_stream`);
    // A host that hasn't run the gyro migration has no such column: read the solve without it.
    if (error && isMissingGyroColumn(error)) ({ data, error } = await read(base));
    return mapSharedSolveResponse({ data: data as unknown as SharedSolveRow | null, error });
  } catch (e) {
    return mapSharedSolveResponse({ thrown: e });
  }
}
