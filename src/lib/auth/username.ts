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
