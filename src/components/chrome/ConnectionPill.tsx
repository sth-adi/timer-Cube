"use client";

import { useMemo } from "react";
import { CloudUpload, WifiOff } from "lucide-react";
import { useOfflineStore } from "@/lib/store/offlineStore";
import { useAuthStore } from "@/lib/store/authStore";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { countUnpushed } from "@/lib/db/cloudSync";

/**
 * Says so when there's no connection, and how many solves are waiting to be sent to the cloud
 * once there is one — so recording solves offline never leaves you wondering whether they count.
 * Silent whenever everything's connected and up to date.
 */
export function ConnectionPill() {
  const online = useOfflineStore((s) => s.online);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const status = useCloudSyncStore((s) => s.status);
  const solves = useSessionStore((s) => s.allSolves);
  // Re-count whenever the connection flips or a sync ends, not only when solves change.
  const pending = useMemo(() => {
    void online;
    void status;
    return userId ? countUnpushed(userId, solves) : 0;
  }, [userId, solves, online, status]);

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
  return null;
}
