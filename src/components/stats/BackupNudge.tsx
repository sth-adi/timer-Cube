"use client";

import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { backupNudge } from "@/lib/backup/backup";
import { useAuthStore } from "@/lib/store/authStore";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { downloadBackup, readBackupMeta, writeBackupMeta } from "@/lib/backup/restore";
import { useNow } from "@/hooks/useNow";

const WEEK = 7 * 86_400_000;
/** A successful sync this recent means the cloud holds a copy; a failed or offline attempt since doesn't undo it. */
const CLOUD_COVERED_MS = 24 * 3_600_000;
const wallNow = () => Date.now();

/** A quiet reminder, once there's real history on the line, that it lives only in this browser. */
export function BackupNudge() {
  const total = useSessionStore((s) => s.allSolves.length);
  // Signed in and syncing: the solves already have a copy in the cloud, so there's nothing to warn about.
  const signedIn = useAuthStore((s) => s.user !== null);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const now = useNow();
  const cloudCovered = signedIn && lastSyncedAt !== null && now - lastSyncedAt < CLOUD_COVERED_MS;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const kind = useMemo(() => {
    void version; // re-read the meta after it's changed
    if (typeof window === "undefined") return null;
    const meta = readBackupMeta();
    if (meta.snoozedUntil !== null && wallNow() < meta.snoozedUntil) return null;
    return backupNudge(meta, total, wallNow());
  }, [total, version]);

  if (!kind || cloudCovered) return null;
  return (
    <div className="card flex flex-col gap-1.5 rounded-xl border border-warning/30 px-3 py-2 max-lg:border-transparent" data-testid="backup-nudge">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <ShieldAlert size={13} /> {kind === "never" ? `${total} solves, and no backup` : "Your last backup is getting old"}
      </p>
      <p className="text-[11px] leading-snug text-muted sm:hidden">Stored in this browser only. Sign in under Settings for a cloud copy, or save a file.</p>
      <p className="text-[11px] leading-snug text-muted max-sm:hidden">{isSupabaseConfigured()
          ? "Your solves are stored in this browser only — clearing site data, or a new phone, would lose them. Sign in under Settings to keep a cloud copy, or save a backup file."
          : "Your solves are stored in this browser only — clearing site data, or a new phone, would lose them. A backup is one file."}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadBackup();
            } finally {
              setBusy(false);
              setVersion((v) => v + 1);
            }
          }}
          className="hit-y rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-fg disabled:opacity-50"
        >
          Download backup
        </button>
        <button
          type="button"
          onClick={() => {
            writeBackupMeta({ ...readBackupMeta(), snoozedUntil: wallNow() + WEEK });
            setVersion((v) => v + 1);
          }}
          className="hit-y px-1.5 text-[11px] text-muted-2 hover:text-muted"
        >
          Remind me next week
        </button>
      </div>
    </div>
  );
}
