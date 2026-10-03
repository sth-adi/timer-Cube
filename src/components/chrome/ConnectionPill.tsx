"use client";

import { useMemo } from "react";
import { CloudAlert, CloudCheck, CloudOff, CloudUpload, WifiOff } from "lucide-react";
import { useOfflineStore } from "@/lib/store/offlineStore";
import { useAuthStore } from "@/lib/store/authStore";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { countUnpushed } from "@/lib/db/cloudSync";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTime } from "@/lib/utils/relativeTime";

/** Local changes still unsent after this long, while online and not mid-sync, count as a problem. */
const STALE_PENDING_MS = 2 * 60_000;

/**
 * Says so when there's no connection, and how many solves are waiting to be sent to the cloud
 * once there is one — so recording solves offline never leaves you wondering whether they count.
 * When signed in and online it also reflects cloud sync: a muted icon-only check when healthy, a
 * tap-to-retry warning pill when the last sync failed or changes have sat unsent for a while.
 */
export function ConnectionPill() {
  const online = useOfflineStore((s) => s.online);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const status = useCloudSyncStore((s) => s.status);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const syncError = useCloudSyncStore((s) => s.error);
  const syncNow = useCloudSyncStore((s) => s.syncNow);
  // This device holds another account's solves: nothing is waiting to sync to this one until the user chooses.
  const paused = useCloudSyncStore((s) => s.ownerConflict !== null);
  const openOwnerPrompt = useCloudSyncStore((s) => s.openOwnerPrompt);
  const now = useNow();
  const solves = useSessionStore((s) => s.allSolves);
  // Re-count whenever the connection flips or a sync ends, not only when solves change.
  const pending = useMemo(() => {
    void online;
    void status;
    return userId && !paused ? countUnpushed(userId, solves) : 0;
  }, [userId, solves, online, status, paused]);
  // Unsent changes older than the threshold. Only changes made after the last finished sync count,
  // because countUnpushed's slack window also covers a few solves that did go up in that sync.
  const stalePending = useMemo(() => {
    // Nothing to judge until a sync has finished on this page load — otherwise a reload flashes "Not synced" for solves that went up last time.
    if (!userId || pending === 0 || lastSyncedAt === null) return 0;
    const cutoff = now - STALE_PENDING_MS;
    const since = lastSyncedAt;
    return countUnpushed(
      userId,
      solves.filter((s) => {
        const at = s.updatedAt ?? s.date;
        return at < cutoff && at > since;
      }),
    );
  }, [userId, pending, solves, now, lastSyncedAt]);

  if (!online) {
    return (
      <div
        className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning"
        title={
          userId
            ? "No connection. Everything still works and is saved on this device; solves sync to your account when you're back online."
            : "No connection. Everything still works and is saved on this device."
        }
        role="status"
      >
        <WifiOff size={12} className="shrink-0" />
        <span>Offline</span>
        {pending > 0 && <span className="tabular-nums">· {pending} to sync</span>}
      </div>
    );
  }
  if (userId && status === "syncing" && pending > 0) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent" role="status">
        <CloudUpload size={12} className="shrink-0 animate-pulse" />
        <span className="tabular-nums">Syncing {pending}</span>
      </div>
    );
  }
  if (!userId) return null;

  const retry = (label: string, title: string) => (
    <button
      type="button"
      onClick={() => void syncNow()}
      className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning"
      title={title}
      aria-label={`${label}. ${title}`}
    >
      <CloudAlert size={12} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
  if (paused) {
    return (
      <button
        type="button"
        onClick={openOwnerPrompt}
        className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning"
        title="This device has solves from another account, so sync is paused. Tap to choose what to do with them."
        aria-label="Sync paused. This device has solves from another account; tap to choose what to do with them."
      >
        <CloudOff size={12} className="shrink-0" />
        <span>Sync paused</span>
      </button>
    );
  }
  if (status === "error") {
    return retry("Sync failed · Retry", syncError ?? "Sync failed. Tap to retry.");
  }
  if (status !== "syncing" && stalePending > 0) {
    return retry(
      "Not synced · Retry",
      `${stalePending} ${stalePending === 1 ? "solve hasn't" : "solves haven't"} been sent to your account yet. Tap to retry.`,
    );
  }
  if (status === "synced") {
    const label = lastSyncedAt ? `Synced · ${formatRelativeTime(lastSyncedAt, now)}` : "Synced";
    return (
      <span className="flex items-center px-1 text-muted-2" title={label} aria-label={label} role="status">
        <CloudCheck size={14} className="shrink-0" />
      </span>
    );
  }
  return null;
}
