"use client";

import { useRef, useState } from "react";
import { CloudUpload, HardDrive, Loader2, LogOut, Users } from "lucide-react";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { useModalLayer } from "@/hooks/useModalLayer";

/**
 * Asked when someone signs in on a device that holds another account's solves (see
 * checkDataOwnership in lib/db/cloudSync.ts). Sync is paused until they answer, so the previous
 * account's history is never copied into the new one without saying so. Every option keeps the
 * solves on this device; none of them touches the other account.
 */
export function AccountDataPrompt() {
  const conflict = useCloudSyncStore((s) => s.ownerConflict);
  const open = useCloudSyncStore((s) => s.ownerPromptOpen);
  if (!conflict || !open) return null;
  return <AccountDataDialog />;
}

function AccountDataDialog() {
  const conflict = useCloudSyncStore((s) => s.ownerConflict);
  const addToAccount = useCloudSyncStore((s) => s.addLocalDataToAccount);
  const keepOnDevice = useCloudSyncStore((s) => s.keepLocalDataOnDevice);
  const cancelSignIn = useCloudSyncStore((s) => s.cancelSignIn);
  const dismiss = useCloudSyncStore((s) => s.dismissOwnerPrompt);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes it without choosing — sync just stays paused, and it can be reopened from the
  // sync pill or Settings. Never "cancel sign-in": signing out shouldn't happen by accident.
  // The modal layer also stops the timer's keys while this is up and keeps focus inside.
  useModalLayer(dialogRef, dismiss);

  if (!conflict) return null;

  const owner = conflict.ownerName ? `@${conflict.ownerName}` : "another account";
  const me = `@${conflict.userName}`;
  const solves = `${conflict.solveCount} ${conflict.solveCount === 1 ? "solve" : "solves"}`;
  const run = (fn: () => unknown) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      data-testid="account-data-prompt"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-data-title"
        tabIndex={-1}
        className="card flex w-full max-w-sm flex-col gap-3 rounded-2xl p-4 outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Users size={16} />
          </span>
          <h2 id="account-data-title" className="text-base font-semibold text-foreground">
            Solves from {owner}
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          This device has {solves} from {owner}. You&apos;re signed in as {me}. Nothing has been synced yet — choose
          what to do with them.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={run(addToAccount)}
            className="flex items-start gap-2 rounded-xl bg-accent px-3 py-2 text-left text-accent-fg disabled:opacity-40"
            data-testid="account-data-add"
          >
            {busy ? <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin" /> : <CloudUpload size={15} className="mt-0.5 shrink-0" />}
            <span className="flex flex-col">
              <span className="text-sm font-semibold">Add them to {me}</span>
              <span className="text-[11px] opacity-80">Uploads them to {me} and syncs as usual. Nothing in {owner} changes.</span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={keepOnDevice}
            className="flex items-start gap-2 rounded-xl bg-bg-panel-2 px-3 py-2 text-left text-foreground disabled:opacity-40"
            data-testid="account-data-keep"
          >
            <HardDrive size={15} className="mt-0.5 shrink-0 text-muted" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Keep them only on this device</span>
              <span className="text-[11px] text-muted-2">Stay signed in, but don&apos;t sync {me} here. You can change this in Settings.</span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={run(cancelSignIn)}
            className="flex items-start gap-2 rounded-xl px-3 py-2 text-left text-muted hover:text-foreground disabled:opacity-40"
            data-testid="account-data-cancel"
          >
            <LogOut size={15} className="mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Cancel sign-in</span>
              <span className="text-[11px] text-muted-2">Sign out of {me}. The solves stay on this device as they are.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
