"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type BackupState = "idle" | "working" | "done" | "failed";

/**
 * The body of app/error.tsx and app/global-error.tsx: what to say when rendering crashed.
 * Solves live in this device's own database, so a crash never touches them — and the backup
 * button reads that database directly (loaded on click, so a crash in the heavy app code can't
 * take the lifeline down with it). "Home" is a plain link: a full load starts from a clean slate.
 */
export function ErrorScreen({ error, onRetry }: { error: Error & { digest?: string }; onRetry: () => void }) {
  const [backup, setBackup] = useState<BackupState>("idle");

  useEffect(() => {
    console.error(error);
  }, [error]);

  async function download() {
    setBackup("working");
    try {
      const { downloadBackup } = await import("@/lib/backup/restore");
      await downloadBackup();
      setBackup("done");
    } catch {
      setBackup("failed");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 pb-[calc(2.5rem+var(--safe-bottom))] pt-10 text-center" data-testid="error-screen">
      <AlertTriangle size={32} className="text-danger" aria-hidden />
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm leading-snug text-muted">
        Your solves are safe on this device — they&apos;re stored locally and this error doesn&apos;t touch them.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onRetry} className="chrome-btn chrome-btn--lg chrome-btn--primary">
          Try again
        </button>
        {/* A full page load on purpose: it gets out of whatever state broke. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="chrome-btn chrome-btn--lg chrome-btn--quiet">
          Back to timer
        </a>
        <button
          type="button"
          onClick={download}
          disabled={backup === "working"}
          className="chrome-btn chrome-btn--lg chrome-btn--quiet disabled:opacity-60"
        >
          {backup === "working" ? "Preparing…" : "Download backup"}
        </button>
      </div>
      <p role="status" className="min-h-5 text-xs text-muted-2">
        {backup === "done" && "Backup downloaded."}
        {backup === "failed" && <span className="text-danger">Couldn&apos;t make a backup — storage may be blocked.</span>}
      </p>
    </main>
  );
}
