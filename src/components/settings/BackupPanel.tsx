"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadBackup, previewBackup, readBackupMeta, restoreBackup } from "@/lib/backup/restore";
import type { BackupFile } from "@/lib/backup/backup";
import { useSessionStore } from "@/lib/store/sessionStore";

type Preview = { file: BackupFile; skipped: number; summary: { solves: number; sessions: number; settings: number } };

/**
 * Backup & restore: everything on this device in one file, and a way to put
 * it back. Restoring merges — it can't overwrite newer work or bring back
 * something you deleted — so it's safe to try on a device that's in use.
 */
export function BackupPanel() {
  const refresh = useSessionStore((s) => s.refreshFromDb);
  const adopt = useSessionStore((s) => s.adoptSyncedSessionIfLocalEmpty);
  const input = useRef<HTMLInputElement>(null);
  const [lastAt, setLastAt] = useState<number | null>(() => (typeof window === "undefined" ? null : readBackupMeta().lastAt));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onBackup = async () => {
    setBusy(true);
    try {
      const file = await downloadBackup();
      setLastAt(file.exportedAt);
      setMessage({ tone: "ok", text: `Saved a backup of ${file.sync.solves.length} solves.` });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't make the backup." });
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      setPreview(previewBackup(await file.text()));
    } catch (e) {
      setPreview(null);
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't read that file." });
    }
    if (input.current) input.current.value = "";
  };

  const onRestore = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await restoreBackup(preview.file, { settings: withSettings });
      await refresh();
      // A wiped device starts with an empty "Session 1"; land on the restored one instead.
      await adopt();
      const parts = [`${r.merge.addedSolves} solve${r.merge.addedSolves === 1 ? "" : "s"} added`, r.merge.updated ? `${r.merge.updated} updated` : null, r.settingsRestored ? `${r.settingsRestored} settings restored` : null].filter(Boolean);
      setMessage({ tone: "ok", text: `Restored: ${parts.join(", ")}.${r.settingsRestored ? " Reloading…" : ""}` });
      setPreview(null);
      // Settings are read when the app loads, so pick them up with a reload.
      if (r.settingsRestored) setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't restore that backup." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="backup-panel">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">Backup</p>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-2">
        Your solves live only in this browser. A backup is one file with everything — solves, sessions, settings, algorithm progress — that you can keep anywhere.
        {lastAt !== null && <> Last backup: {new Date(lastAt).toLocaleDateString()}.</>}
      </p>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => void onBackup()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-2 py-2 text-xs font-medium text-accent disabled:opacity-50" data-testid="backup-download">
          <Download size={13} /> Download backup
        </button>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-2 py-2 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50">
          <Upload size={13} /> Restore…
        </button>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} data-testid="backup-file" />
      </div>

      {preview && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-bg-panel-2 p-2.5" data-testid="backup-preview">
          <p className="text-xs text-foreground">
            This backup has {preview.summary.solves} solves in {preview.summary.sessions} session{preview.summary.sessions === 1 ? "" : "s"}
            {preview.file.exportedAt ? `, made ${new Date(preview.file.exportedAt).toLocaleDateString()}` : ""}.
          </p>
          {preview.skipped > 0 && <p className="text-[11px] text-warning">{preview.skipped} unreadable entr{preview.skipped === 1 ? "y was" : "ies were"} left out.</p>}
          <p className="text-[11px] leading-snug text-muted-2">Solves are merged in: nothing newer here is overwritten, and anything you deleted stays deleted.</p>
          {preview.summary.settings > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />
              Also restore settings and training progress ({preview.summary.settings}) — replaces what&apos;s here
            </label>
          )}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void onRestore()} disabled={busy} className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-50" data-testid="backup-restore">
              Merge into this device
            </button>
            <button type="button" onClick={() => setPreview(null)} className="rounded-lg bg-bg-panel px-2.5 py-1.5 text-xs text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={message.tone === "ok" ? "mt-2 text-[11px] text-success" : "mt-2 text-[11px] text-danger"} data-testid="backup-message">
          {message.text}
        </p>
      )}
    </div>
  );
}
