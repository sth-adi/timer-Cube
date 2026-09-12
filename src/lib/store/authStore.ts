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

export const useAuthStore = create<AuthState>((set) => {
  const supabase = getSupabaseClient();

  if (supabase) {
    void supabase.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? null, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, ready: true });
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
