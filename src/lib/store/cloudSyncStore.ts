"use client";

import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { useSessionStore } from "./sessionStore";
import {
  checkDataOwnership,
  claimLocalData,
  keepLocalDataOffAccount,
  syncWithCloud,
  SyncTimeoutError,
} from "@/lib/db/cloudSync";
import { displayUsername } from "@/lib/auth/username";
import { suggestSession, type SessionSuggestion } from "@/lib/db/sessionSuggestion";

/**
 * "offline" is not a failure: nothing was attempted, and reconnecting syncs again. "error" is a sync that was tried and failed.
 * "paused": this device holds another account's solves, so nothing syncs until the user says what to do with them (ownerConflict).
 */
export type CloudSyncStatus = "idle" | "syncing" | "synced" | "offline" | "error" | "paused";

/** The signed-in account and the account this device's solves belong to differ. */
export interface OwnerConflict {
  /** The signed-in account. */
  userId: string;
  userName: string;
  /** The account the solves on this device belong to. */
  ownerId: string;
  /** Null for data saved before usernames were recorded. */
  ownerName: string | null;
  solveCount: number;
  /** They already chose to keep the solves on this device without syncing; not asked again unless they reopen it. */
  keptLocal: boolean;
}

interface CloudSyncState {
  /** Set after a sync when this device's open session is small but another holds the account's history. */
  suggestion: SessionSuggestion | null;
  dismissSuggestion: () => void;
  status: CloudSyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  syncNow: () => Promise<void>;
  ownerConflict: OwnerConflict | null;
  /** Whether the "solves from another account" prompt is showing. */
  ownerPromptOpen: boolean;
  openOwnerPrompt: () => void;
  /** Closes the prompt without choosing: sync stays paused for now and it's asked again next sign-in or reload. */
  dismissOwnerPrompt: () => void;
  /** Uploads this device's solves to the signed-in account (they stay in the other account too). */
  addLocalDataToAccount: () => Promise<void>;
  /** Stays signed in, but this device doesn't sync for this account. */
  keepLocalDataOnDevice: () => void;
  /** Signs out again; the device's solves are left as they were. */
  cancelSignIn: () => Promise<void>;
}

/**
 * `instanceof Error` is not reliable across engines for every thrown value
 * this can see — notably Safari/WebKit's DOMException (what a blocked or
 * failing IndexedDB access throws, e.g. from db.sessions.toArray() inside
 * pushAll) does not satisfy `instanceof Error` there, even though it has a
 * perfectly good `.message`. Duck-typing on `.message` instead of checking
 * the prototype chain means a real underlying reason always surfaces
 * instead of silently collapsing to a bare "Sync failed."
 */
function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Sync failed.";
}

function friendlyErrorMessage(err: unknown): string {
  if (err instanceof SyncTimeoutError) return "Couldn't reach the server — retrying automatically…";
  const raw = errorMessage(err);
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

/**
 * Changes a sync itself makes to the local session store (refreshing it with what just arrived)
 * must not count as "the user changed something" — that re-triggered another sync, which pulled
 * the whole history again, which refreshed the store again…
 */
let applyingSync = false;
let inFlight = false;
let rerunRequested = false;
let lastFinishedAt = 0;
/** Automatic (change-triggered) syncs keep at least this much distance, however often the store changes. */
const AUTO_SYNC_MIN_GAP_MS = 15_000;

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  suggestion: null,
  dismissSuggestion: () => set({ suggestion: null }),
  status: "idle",
  lastSyncedAt: null,
  error: null,
  ownerConflict: null,
  ownerPromptOpen: false,

  openOwnerPrompt: () => {
    if (get().ownerConflict) set({ ownerPromptOpen: true });
  },
  dismissOwnerPrompt: () => set({ ownerPromptOpen: false }),

  addLocalDataToAccount: async () => {
    const user = useAuthStore.getState().user;
    const conflict = get().ownerConflict;
    if (!user || !conflict || conflict.userId !== user.id) return;
    claimLocalData(user.id, displayUsername(user));
    set({ ownerConflict: null, ownerPromptOpen: false, status: "idle" });
    await get().syncNow();
  },

  keepLocalDataOnDevice: () => {
    const user = useAuthStore.getState().user;
    const conflict = get().ownerConflict;
    if (!user || !conflict || conflict.userId !== user.id) return;
    keepLocalDataOffAccount(user.id, conflict.ownerId);
    set({ ownerConflict: { ...conflict, keptLocal: true }, ownerPromptOpen: false, status: "paused" });
  },

  cancelSignIn: async () => {
    set({ ownerConflict: null, ownerPromptOpen: false, status: "idle" });
    await useAuthStore.getState().signOut();
  },

  syncNow: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set({ status: "offline", error: null });
      return;
    }
    // One at a time; a request that arrives mid-sync runs once more afterwards, so nothing is missed.
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = true;
    set({ status: "syncing", error: null });
    try {
      // Before anything is pulled or pushed: whose solves are these? Another account's are never
      // uploaded (or mixed with this account's) without asking.
      const ownership = await checkDataOwnership(user.id);
      if (useAuthStore.getState().user?.id !== user.id) {
        set({ status: "idle" });
        return;
      }
      const { decision } = ownership;
      if (decision.kind !== "sync") {
        const conflict: OwnerConflict = {
          userId: user.id,
          userName: displayUsername(user),
          ownerId: decision.ownerId,
          ownerName: ownership.ownerName,
          solveCount: ownership.localSolves,
          keptLocal: decision.kind === "kept-local",
        };
        const prev = get().ownerConflict;
        const same = prev !== null && prev.userId === conflict.userId && prev.ownerId === conflict.ownerId;
        clearScheduledRetry();
        set({ status: "paused", ownerConflict: conflict, ownerPromptOpen: same ? get().ownerPromptOpen : !conflict.keptLocal });
        return;
      }
      claimLocalData(user.id, displayUsername(user));
      if (get().ownerConflict) set({ ownerConflict: null, ownerPromptOpen: false });
      // Pull-then-push: merging the cloud's state in first means what gets
      // pushed is already the most recent version of everything.
      // Also publishes the public stats (rival lookups and the daily leaderboard read them) from the
      // same read of the solves the push made — best-effort, so a failure there is not a sync
      // failure the way a failed push/pull of your own solve history is.
      const result = await syncWithCloud(user.id, { publishStatsAs: displayUsername(user) });
      if (result.addedSessions > 0 || result.addedSolves > 0 || result.updated > 0 || result.removed > 0) {
        applyingSync = true;
        try {
          await useSessionStore.getState().refreshFromDb();
          await useSessionStore.getState().adoptSyncedSessionIfLocalEmpty();
        } finally {
          applyingSync = false;
        }
      }
      // Not inside applyingSync: removing the empty session is a real change the next sync must push as a tombstone.
      await useSessionStore.getState().dropEmptyAutoSession().catch(() => {});
      const { sessions, allSolves, activeSessionId } = useSessionStore.getState();
      set({ suggestion: suggestSession(sessions, allSolves, activeSessionId) });
      clearScheduledRetry();
      set({ status: "synced", lastSyncedAt: Date.now() });
    } catch (err) {
      // Dropped off the network mid-sync: the "online" listener syncs again, so no retry timer.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        set({ status: "offline", error: null });
      } else {
        set({ status: "error", error: friendlyErrorMessage(err) });
        scheduleRetry();
      }
    } finally {
      inFlight = false;
      lastFinishedAt = Date.now();
      if (rerunRequested) {
        rerunRequested = false;
        setTimeout(() => void useCloudSyncStore.getState().syncNow(), AUTO_SYNC_MIN_GAP_MS / 3);
      }
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
    if (state.user?.id === prev.user?.id) return;
    // A different account (or none): what was known about the last one's sync no longer applies.
    clearScheduledRetry();
    useCloudSyncStore.setState({ status: "idle", error: null, lastSyncedAt: null, suggestion: null, ownerConflict: null, ownerPromptOpen: false });
    if (state.user) void useCloudSyncStore.getState().syncNow();
  });

  window.addEventListener("online", () => {
    if (useAuthStore.getState().user) void useCloudSyncStore.getState().syncNow();
  });

  // The "online" event can be missed (a phone coming out of a tunnel, a tab asleep through it), and
  // the automatic retries above stop after a few attempts. Coming back to the app, or just waiting
  // a minute, tries again whenever the last sync didn't finish.
  const retryIfStuck = () => {
    if (!useAuthStore.getState().user || typeof navigator === "undefined" || !navigator.onLine) return;
    const { status } = useCloudSyncStore.getState();
    if (status === "error" || status === "offline") void useCloudSyncStore.getState().syncNow();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retryIfStuck();
  });
  window.setInterval(retryIfStuck, 60_000);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  useSessionStore.subscribe((state, prev) => {
    if (state.allSolves === prev.allSolves && state.sessions === prev.sessions) return;
    if (applyingSync || !useAuthStore.getState().user) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    // Soon after a change, but never closer to the last sync than the minimum gap.
    const wait = Math.max(1500, lastFinishedAt + AUTO_SYNC_MIN_GAP_MS - Date.now());
    debounceTimer = setTimeout(() => void useCloudSyncStore.getState().syncNow(), wait);
  });
}
