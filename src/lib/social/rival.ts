import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

export interface PublicStats {
  username: string;
  bestSingleMs: number | null;
  bestAo5Ms: number | null;
  bestAo12Ms: number | null;
  totalSolves: number;
}

/**
 * Looks up another account's public_stats row by username — the only
 * cross-user data this app ever reads, and deliberately just a handful of
 * best times + a solve count (see cloudSync.ts's pushPublicStats). Never
 * throws: a typo'd or nonexistent username, and a network failure, both
 * just render as "not found" — a rival lookup is a nice-to-have, not
 * something worth an error banner over.
 */
export async function fetchPublicStatsByUsername(username: string): Promise<PublicStats | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await withTimeout(
    supabase.from("public_stats").select("username, best_single_ms, best_ao5_ms, best_ao12_ms, total_solves").ilike("username", username.trim()).maybeSingle(),
  ).catch(() => ({ data: null, error: null }));
  if (error || !data) return null;
  return {
    username: data.username,
    bestSingleMs: data.best_single_ms,
    bestAo5Ms: data.best_ao5_ms,
    bestAo12Ms: data.best_ao12_ms,
    totalSolves: data.total_solves,
  };
}
