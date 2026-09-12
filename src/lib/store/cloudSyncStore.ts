"use client";

import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { useSessionStore } from "./sessionStore";
import { pullAll, pushAll } from "@/lib/db/cloudSync";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

interface CloudSyncState {
  status: CloudSyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  syncNow: () => Promise<void>;
}

export const useCloudSyncStore = create<CloudSyncState>((set) => ({
  status: "idle",
  lastSyncedAt: null,
  error: null,

  syncNow: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set({ status: "error", error: "Offline — will sync once you're back online." });
      return;
    }
    set({ status: "syncing", error: null });
    try {
      await pushAll(user.id);
      const result = await pullAll(user.id);
      if (result.addedSessions > 0 || result.addedSolves > 0) {
        await useSessionStore.getState().refreshFromDb();
      }
      set({ status: "synced", lastSyncedAt: Date.now() });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Sync failed." });
    }
  },
}));

let wired = false;

/**
 * Wires cloud sync to fire automatically — on sign-in, whenever the local
 * solve/session history changes, and on reconnecting after being offline —
 * so the "Sync now" button in Settings is a manual override, not the only
 * way this ever runs. Called once from AppBootstrap rather than at this
 * module's own top level: it subscribes to both authStore and sessionStore,
 * and calling subscribe() at import time would race whichever of those two
 * modules hasn't finished initializing yet.
 */
export function initCloudSync(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;

  useAuthStore.subscribe((state, prev) => {
    if (state.user && state.user.id !== prev.user?.id) void useCloudSyncStore.getState().syncNow();
  });

  window.addEventListener("online", () => {
    if (useAuthStore.getState().user) void useCloudSyncStore.getState().syncNow();
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  useSessionStore.subscribe((state, prev) => {
    if (state.allSolves === prev.allSolves && state.sessions === prev.sessions) return;
    if (!useAuthStore.getState().user) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void useCloudSyncStore.getState().syncNow(), 1500);
  });
}
