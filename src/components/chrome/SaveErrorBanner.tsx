"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { downloadBackup } from "@/lib/backup/restore";

/**
 * Shown when a solve couldn't be written to this device (storage full or blocked) — otherwise the
 * time would sit on screen looking saved while it was never stored. Offers the backup download,
 * which reads whatever is still there.
 */
export function SaveErrorBanner() {
  const saveError = useSessionStore((s) => s.saveError);
  const clear = useSessionStore((s) => s.clearSaveError);
  const [exportFailed, setExportFailed] = useState(false);

  if (!saveError) return null;
  return (
    <div className="mx-3 mt-1 flex items-center gap-2 rounded-xl bg-danger/15 px-3 py-2 text-xs sm:mx-4" role="alert" data-testid="save-error-banner">
      <AlertTriangle size={14} className="shrink-0 text-danger" />
      <p className="min-w-0 flex-1 leading-snug text-foreground">
        Couldn&apos;t save your last solve — storage is full or blocked. Export a backup now.
        {exportFailed && <span className="text-danger"> The backup failed too.</span>}
      </p>
      <button
        type="button"
        onClick={() => {
          setExportFailed(false);
          downloadBackup().then(clear, () => setExportFailed(true));
        }}
        className="shrink-0 rounded-full bg-accent px-3 py-1 font-semibold text-accent-fg"
      >
        Export backup
      </button>
      <button type="button" onClick={clear} className="shrink-0 px-1 text-muted-2 hover:text-muted" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
