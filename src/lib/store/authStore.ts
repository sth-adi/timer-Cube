"use client";

import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth/username";

interface AuthState {
  user: User | null;
  /** False until the initial session check (or the "no Supabase configured" fallback) resolves. */
  ready: boolean;
  /** `needsConfirmation` is true when sign-up succeeded but the project still requires email confirmation — impossible to complete on a synthetic address, so the UI needs to tell the user to turn that setting off. */
  signUp: (username: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

/**
 * The account saved in this browser by the last sign-in. With no connection, Supabase can't
 * renew an expired login and reports "no session" — which would make an offline app look signed
 * out (and hide the sync status). The saved login stays valid on the server; it's renewed
 * automatically once the connection is back, so until then the saved account stands in for it.
 */
function rememberedUser(): User | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { user?: User } | null;
      if (parsed?.user?.id) return parsed.user;
    }
  } catch {
    // Unreadable storage: no remembered account.
  }
  return null;
}

const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

export const useAuthStore = create<AuthState>((set) => {
  const supabase = getSupabaseClient();

  if (supabase) {
    void supabase.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? (isOffline() ? rememberedUser() : null), ready: true }));
    supabase.auth.onAuthStateChange((event, session) => {
      // A missing session while offline is "couldn't renew", not "signed out" — only an explicit sign-out clears the account.
      const user = session?.user ?? (event !== "SIGNED_OUT" && isOffline() ? rememberedUser() : null);
      set({ user, ready: true });
    });
  }

  return {
    user: null,
    ready: !supabase,

    signUp: async (username, password) => {
      if (!supabase) return { error: null, needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { data: { username } },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    },

    signIn: async (username, password) => {
      if (!supabase) return { error: null };
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      return { error: error?.message ?? null };
    },

    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
});
