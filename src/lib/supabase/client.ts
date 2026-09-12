import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Account sync is optional — the app must keep working fully offline without
 * it (see AGENTS/CLAUDE on offline-first) — so this returns null rather than
 * throwing when the env vars aren't configured, and every caller treats null
 * as "cloud sync unavailable" instead of a hard error.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}
