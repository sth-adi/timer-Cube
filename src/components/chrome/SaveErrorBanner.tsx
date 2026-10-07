"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { downloadBackup } from "@/lib/backup/restore";

/** What to tell the person, by what went wrong (see SaveErrorKind). */
const COPY = {
  write: "Couldn't save your last solve — storage is full or blocked. Export a backup now.",
  open: "Couldn't open this device's storage, so your solves can't be saved here. A private window or blocked site data can cause this — try a normal window.",
  loading: "Your last solve wasn't saved — your history was still loading. Give it a moment, then solve again.",
} as const;

/**
 * Shown when a solve couldn't be written to this device (storage full, blocked, never opened, or
 * not loaded in time) — otherwise the time would sit on screen looking saved while it was never
 * stored. For a refused write it offers the backup download, which reads whatever is still there.
 */
export function SaveErrorBanner() {
  const saveError = useSessionStore((s) => s.saveError);
  const clear = useSessionStore((s) => s.clearSaveError);
  const [exportFailed, setExportFailed] = useState(false);

  if (!saveError) return null;
  return (
    <div className="chrome-banner chrome-banner--danger" role="alert" data-testid="save-error-banner">
      <AlertTriangle size={16} className="shrink-0 text-danger" aria-hidden="true" />
      <p className="chrome-banner__text">
        {COPY[saveError.kind]}
        {exportFailed && <span className="text-danger"> The backup failed too.</span>}
      </p>
      {saveError.kind === "write" && (
        <button
          type="button"
          onClick={() => {
            setExportFailed(false);
            downloadBackup().then(clear, () => setExportFailed(true));
          }}
          className="chrome-btn chrome-btn--primary hit-y"
        >
          Export backup
        </button>
      )}
      <button type="button" onClick={clear} className="chrome-dismiss hit" aria-label="Dismiss">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
