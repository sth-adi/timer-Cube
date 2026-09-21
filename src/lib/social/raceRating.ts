import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

export interface RaceRating {
  rating: number;
  wins: number;
  losses: number;
}

export interface RaceLeaderboardEntry {
  username: string;
  rating: number;
  wins: number;
  losses: number;
  isYou: boolean;
}

export interface RaceLeaderboard {
  top: RaceLeaderboardEntry[];
  yourRank: number | null;
  total: number;
}

const STARTING_RATING = 1200;
const K_FACTOR = 32;
const LEADERBOARD_TOP_N = 20;

/** Standard Elo expected-score + update — every race feeds this once, from each side independently (there's no server refereeing a WebRTC race, so both clients compute the same formula off the ratings they exchanged at connect time and their own local result). */
export function nextRating(myRating: number, opponentRating: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((opponentRating - myRating) / 400));
  return Math.round(myRating + K_FACTOR * ((won ? 1 : 0) - expected));
}

export async function fetchRaceRating(userId: string): Promise<RaceRating> {
  const fallback: RaceRating = { rating: STARTING_RATING, wins: 0, losses: 0 };
  const supabase = getSupabaseClient();
  if (!supabase) return fallback;
  const { data } = await withTimeout(
    supabase.from("race_ratings").select("rating, wins, losses").eq("user_id", userId).maybeSingle(),
  ).catch(() => ({ data: null }));
  if (!data) return fallback;
  return { rating: data.rating as number, wins: data.wins as number, losses: data.losses as number };
}

/** Upsert the post-race rating + tallies — takes the already-computed next rating (see nextRating) rather than recomputing it, since only the caller knows both sides' ratings from the race. */
export async function updateRaceRating(userId: string, username: string, newRating: number, won: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const current = await fetchRaceRating(userId);
  await withTimeout(
    supabase.from("race_ratings").upsert({
      user_id: userId,
      username,
      rating: newRating,
      wins: current.wins + (won ? 1 : 0),
      losses: current.losses + (won ? 0 : 1),
      updated_at: new Date().toISOString(),
    }),
  ).catch(() => {});
}

export async function fetchRaceLeaderboard(userId: string | null): Promise<RaceLeaderboard> {
  const supabase = getSupabaseClient();
  if (!supabase) return { top: [], yourRank: null, total: 0 };
  const { data, error } = await withTimeout(
    supabase.from("race_ratings").select("user_id, username, rating, wins, losses").order("rating", { ascending: false }),
  ).catch(() => ({ data: null, error: null }));
  if (error || !data) return { top: [], yourRank: null, total: 0 };
  const top = data
    .slice(0, LEADERBOARD_TOP_N)
    .map((r) => ({
      username: r.username as string,
      rating: r.rating as number,
      wins: r.wins as number,
      losses: r.losses as number,
      isYou: r.user_id === userId,
    }));
  const yourIndex = userId ? data.findIndex((r) => r.user_id === userId) : -1;
  return { top, yourRank: yourIndex >= 0 ? yourIndex + 1 : null, total: data.length };
}
