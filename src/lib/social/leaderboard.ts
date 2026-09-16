import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

export interface DailyLeaderboardEntry {
  username: string;
  ao5Ms: number;
  isYou: boolean;
}

export interface DailyLeaderboard {
  top: DailyLeaderboardEntry[];
  /** 1-based rank, or null if this account hasn't submitted today (or isn't signed in). */
  yourRank: number | null;
  total: number;
}

/** Publishes today's ao5 to the shared leaderboard — upsert on (user_id, challenge_date), so re-running the same day's challenge (there is no way to in this app, but defensively) just overwrites rather than duplicating. */
export async function submitDailyChallengeResult(
  userId: string,
  username: string,
  dateKey: string,
  ao5Ms: number,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await withTimeout(
    supabase.from("daily_challenge_results").upsert({
      user_id: userId,
      challenge_date: dateKey,
      username,
      ao5_ms: Math.round(ao5Ms),
    }),
  ).catch(() => {});
}

const LEADERBOARD_TOP_N = 10;

/**
 * Reads back everyone's submitted result for a given day, sorted fastest
 * first. Small dataset by construction (one row per account per day), so a
 * plain full-column select + client-side rank lookup is simpler than a
 * second round-trip for "what's my rank" and cheap enough not to matter.
 */
export async function fetchDailyLeaderboard(dateKey: string, userId: string | null): Promise<DailyLeaderboard> {
  const supabase = getSupabaseClient();
  if (!supabase) return { top: [], yourRank: null, total: 0 };
  const { data, error } = await withTimeout(
    supabase.from("daily_challenge_results").select("user_id, username, ao5_ms").eq("challenge_date", dateKey).order("ao5_ms", { ascending: true }),
  ).catch(() => ({ data: null, error: null }));
  if (error || !data) return { top: [], yourRank: null, total: 0 };
  const top = data
    .slice(0, LEADERBOARD_TOP_N)
    .map((r) => ({ username: r.username as string, ao5Ms: r.ao5_ms as number, isYou: r.user_id === userId }));
  const yourIndex = userId ? data.findIndex((r) => r.user_id === userId) : -1;
  return { top, yourRank: yourIndex >= 0 ? yourIndex + 1 : null, total: data.length };
}
