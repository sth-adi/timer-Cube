"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Cloud, CloudOff, Loader2, LogOut, TriangleAlert, WifiOff } from "lucide-react";
import { useAuthStore } from "@/lib/store/authStore";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { displayUsername, isValidUsername } from "@/lib/auth/username";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTime } from "@/lib/utils/relativeTime";
import { RivalCompare } from "./RivalCompare";

type Mode = "signin" | "signup";

/**
 * Username + password sign-in/up + cloud sync status. Doesn't render at all
 * unless a Supabase project is configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)
 * — this is an optional add-on, and the app already works fully offline off
 * local Dexie storage without it (see AppBootstrap). Once signed in, sync
 * runs automatically in the background (cloudSyncStore's initCloudSync — on
 * sign-in, on every local change, on reconnect); "Sync now" here is a manual
 * override, not the only way it ever happens.
 */
export function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const status = useCloudSyncStore((s) => s.status);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const now = useNow();
  const error = useCloudSyncStore((s) => s.error);
  const syncNow = useCloudSyncStore((s) => s.syncNow);
  const ownerConflict = useCloudSyncStore((s) => s.ownerConflict);
  const openOwnerPrompt = useCloudSyncStore((s) => s.openOwnerPrompt);

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmNotice, setNeedsConfirmNotice] = useState(false);

  if (!isSupabaseConfigured() || !ready) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNeedsConfirmNotice(false);
    if (!isValidUsername(username)) {
      setFormError("Username: 3-20 characters, letters/numbers/underscore only.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { error: err, needsConfirmation } = await signUp(username, password);
      setBusy(false);
      if (err) setFormError(err);
      else if (needsConfirmation) setNeedsConfirmNotice(true);
    } else {
      const { error: err } = await signIn(username, password);
      setBusy(false);
      if (err) setFormError(err);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-2">
        <Cloud size={12} /> Account
      </p>

      {!user ? (
        <>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-2">
            {mode === "signup"
              ? "Create an account to back up your solves and pick them up on any device."
              : "Sign in to back up your solves to your account and pick them up on any device."}{" "}
            The app keeps working fully offline either way.
          </p>
          <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="rounded-lg bg-bg-panel-2 px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              className="rounded-lg bg-bg-panel-2 px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!username.trim() || !password || busy}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg disabled:opacity-40"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setFormError(null);
              setNeedsConfirmNotice(false);
            }}
            className="hit-y mt-1.5 text-[11px] text-muted-2 hover:text-accent"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          {formError && <p className="mt-1.5 text-[11px] text-danger">{formError}</p>}
          {needsConfirmNotice && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-danger">
              Account created, but this Supabase project still has &quot;Confirm email&quot; turned on in
              Authentication settings, turn it off (these accounts don&apos;t use real addresses, so it can never be
              confirmed) and try signing in again.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="min-w-0 truncate text-xs text-foreground/90">{displayUsername(user)}</p>

          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-2">
              {status === "syncing" && (
                <>
                  <Loader2 size={12} className="shrink-0 animate-spin" /> Syncing…
                </>
              )}
              {status === "synced" && <CheckCircle2 size={12} className="shrink-0 text-success" />}
              {status === "error" && <TriangleAlert size={12} className="shrink-0 text-danger" />}
              {status === "offline" && <WifiOff size={12} className="shrink-0" />}
              {status === "paused" && <CloudOff size={12} className="shrink-0 text-warning" />}
              {status === "paused"
                ? "Sync paused on this device"
                : status !== "syncing" &&
                  (lastSyncedAt ? `Last synced ${formatRelativeTime(lastSyncedAt, now)}` : "Not synced yet")}
            </p>
            {ownerConflict ? (
              <button
                type="button"
                onClick={openOwnerPrompt}
                className="hit-y shrink-0 text-[11px] font-medium text-accent hover:underline"
              >
                Choose…
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void syncNow()}
                className="hit-y shrink-0 text-[11px] font-medium text-accent hover:underline"
              >
                Sync now
              </button>
            )}
          </div>
          {ownerConflict && (
            <p className="text-[11px] leading-relaxed text-muted-2">
              This device&apos;s {ownerConflict.solveCount} {ownerConflict.solveCount === 1 ? "solve belongs" : "solves belong"} to{" "}
              {ownerConflict.ownerName ? `@${ownerConflict.ownerName}` : "another account"}, so nothing syncs with this account here
              until you choose what to do with them.
            </p>
          )}
          {status === "error" && error && <p className="text-[11px] leading-relaxed text-danger">{error}</p>}
          {status === "offline" && !ownerConflict && (
            <p className="text-[11px] leading-relaxed text-muted-2">Offline, will sync once you&apos;re back online.</p>
          )}

          <button
            type="button"
            onClick={() => void signOut()}
            className="hit-y flex items-center gap-1.5 self-start text-[11px] text-muted-2 hover:text-danger"
          >
            <LogOut size={12} /> Sign out
          </button>

          <RivalCompare />
        </div>
      )}
    </div>
  );
}
