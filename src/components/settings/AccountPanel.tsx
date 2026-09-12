"use client";

import { useState } from "react";
import { CheckCircle2, Cloud, Loader2, LogOut } from "lucide-react";
import { useAuthStore } from "@/lib/store/authStore";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Google sign-in + cloud sync status. Doesn't render at all unless a
 * Supabase project is configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) — this
 * is an optional add-on, and the app already works fully offline off local
 * Dexie storage without it (see AppBootstrap). Once signed in, sync runs
 * automatically in the background (cloudSyncStore's initCloudSync — on
 * sign-in, on every local change, on reconnect); "Sync now" here is a manual
 * override, not the only way it ever happens.
 */
export function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const status = useCloudSyncStore((s) => s.status);
  const error = useCloudSyncStore((s) => s.error);
  const syncNow = useCloudSyncStore((s) => s.syncNow);
  const [signingIn, setSigningIn] = useState(false);

  if (!isSupabaseConfigured() || !ready) return null;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-2">
        <Cloud size={12} /> Account
      </p>

      {!user ? (
        <>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-2">
            Sign in to back up your solves to your account and pick them up on any device — the app keeps working
            fully offline either way.
          </p>
          <button
            type="button"
            onClick={async () => {
              setSigningIn(true);
              await signInWithGoogle();
              setSigningIn(false);
            }}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110 disabled:opacity-60"
          >
            {signingIn && <Loader2 size={13} className="animate-spin" />}
            Sign in with Google
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {typeof user.user_metadata?.avatar_url === "string" && (
              // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar, not a build asset
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                className="h-7 w-7 rounded-full"
              />
            )}
            <p className="min-w-0 truncate text-xs text-foreground/90">{user.email ?? "Signed in"}</p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-2">
              {status === "syncing" && (
                <>
                  <Loader2 size={12} className="shrink-0 animate-spin" /> Syncing…
                </>
              )}
              {status === "synced" && (
                <>
                  <CheckCircle2 size={12} className="shrink-0 text-success" /> Synced
                </>
              )}
              {status === "error" && <span className="truncate text-danger">{error}</span>}
              {status === "idle" && "Not synced yet"}
            </p>
            <button
              type="button"
              onClick={() => void syncNow()}
              className="shrink-0 text-[11px] font-medium text-accent hover:underline"
            >
              Sync now
            </button>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 self-start text-[11px] text-muted-2 hover:text-danger"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
