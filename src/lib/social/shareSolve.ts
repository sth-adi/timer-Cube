import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

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
}

/** Publishes a solve under a fresh id, retrying on the vanishingly rare id collision. Returns null if Supabase isn't reachable. */
export async function createSharedSolve(input: SharedSolve): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomId();
    const { error } = await withTimeout(
      supabase.from("shared_solves").insert({
        id,
        scramble: input.scramble,
        reconstruction: input.reconstruction,
        time_ms: Math.round(input.timeMs),
        move_timestamps: input.moveTimestamps,
        puzzle: input.puzzle,
        event: input.event,
        username: input.username,
      }),
    ).catch((e) => ({ error: e }));
    if (!error) return id;
  }
  return null;
}

/** The recipient's lookup — null if the id doesn't exist or Supabase is unreachable. */
export async function fetchSharedSolve(id: string): Promise<SharedSolve | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await withTimeout(
    supabase.from("shared_solves").select("scramble, reconstruction, time_ms, move_timestamps, puzzle, event, username").eq("id", id).maybeSingle(),
  ).catch(() => ({ data: null }));
  if (!data) return null;
  return {
    scramble: data.scramble as string,
    reconstruction: data.reconstruction as string,
    timeMs: data.time_ms as number,
    moveTimestamps: (data.move_timestamps as number[] | null) ?? null,
    puzzle: data.puzzle as string,
    event: (data.event as string | null) ?? null,
    username: (data.username as string | null) ?? null,
  };
}
