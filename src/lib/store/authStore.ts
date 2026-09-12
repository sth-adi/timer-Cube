"use client";

import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

interface AuthState {
  user: User | null;
  /** False until the initial session check (or the "no Supabase configured" fallback) resolves. */
  ready: boolean;
  signInWithGoogle: () => Promise<void>;
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

    signInWithGoogle: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    },

    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
});
