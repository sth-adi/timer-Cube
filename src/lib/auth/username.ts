import type { User } from "@supabase/supabase-js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

/**
 * Supabase Auth's identity model is email-based — there's no native
 * "username" concept — so a username account is really a password account
 * on a synthetic, non-deliverable address derived from it. Lowercased so
 * "Alice" and "alice" resolve to the same account on both sign-up and
 * sign-in, and unique-by-construction (Supabase already enforces unique
 * emails), so no separate username-uniqueness table is needed.
 */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@users.cubetimer.local`;
}

/** The username chosen at sign-up, stashed in Supabase Auth's own user_metadata — falls back to the synthetic email's local part for an account created before this field existed. */
export function displayUsername(user: User): string {
  const fromMetadata = user.user_metadata?.username;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;
  return user.email?.split("@")[0] ?? "cuber";
}
