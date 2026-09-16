"use client";

import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { useSessionStore } from "./sessionStore";
import { pullAll, pushAll, SyncTimeoutError } from "@/lib/db/cloudSync";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

interface CloudSyncState {
  status: CloudSyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  syncNow: () => Promise<void>;
}

function friendlyErrorMessage(err: unknown): string {
  if (err instanceof SyncTimeoutError) return "Couldn't reach the server — retrying automatically…";
  const raw = err instanceof Error ? err.message : "Sync failed.";
  // "Failed to fetch" (and its Safari/Firefox equivalents) is the raw
  // TypeError a browser throws for any network-level failure — dropped
  // connection, DNS hiccup, offline — not something a user can act on as
  // written, so it gets the same friendly wording as an explicit timeout.
  if (/fetch|network/i.test(raw)) return "Couldn't reach the server — retrying automatically…";
  return raw;
}

// Module-level rather than in the store's own state, same pattern as
// syncStore.ts's connection handles — this is retry-scheduling machinery,
// not state a component ever needs to read or re-render on.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
/** A handful of bounded, spaced-out attempts to ride out a transient blip (a dropped connection, a flaky mobile handoff) — not an unbounded loop that would hammer a genuinely broken connection forever. Whatever normally triggers a sync (a new solve, reconnecting, signing in, the manual button) still fires independently once attempts here run out. */
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

function clearScheduledRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
}

function scheduleRetry(): void {
  if (retryTimer || retryAttempt >= RETRY_DELAYS_MS.length) return;
  const delay = RETRY_DELAYS_MS[retryAttempt];
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void useCloudSyncStore.getState().syncNow();
  }, delay);
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
      clearScheduledRetry();
      set({ status: "synced", lastSyncedAt: Date.now() });
    } catch (err) {
      set({ status: "error", error: friendlyErrorMessage(err) });
      scheduleRetry();
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
    if (!state.user && prev.user) clearScheduledRetry();
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
