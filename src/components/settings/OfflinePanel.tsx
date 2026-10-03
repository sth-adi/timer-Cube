"use client";

import { useEffect, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { useOfflineStore, warmNow } from "@/lib/store/offlineStore";

function ago(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/**
 * Lets someone about to lose signal save the whole app on this device on demand, instead of
 * waiting for the background save that runs a few seconds after a visit.
 */
export function OfflinePanel() {
  const { available, warming, warmedAt, online } = useOfflineStore();
  // Kept in state (refreshed on a timer) so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  let status: string;
  if (!available) status = "Offline copy works in the installed app";
  else if (warming) status = "Saving…";
  else if (warmedAt) status = `Ready offline ✓ · saved ${ago(now - warmedAt)}`;
  else status = "Not saved for offline yet";

  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="offline-panel">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">Offline</p>
      <p className="mb-2 text-xs text-foreground/90" data-testid="offline-status" aria-live="polite">
        {status}
      </p>
      <button
        type="button"
        onClick={() => warmNow()}
        disabled={!available || warming || !online}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110 disabled:opacity-50"
        data-testid="offline-save"
      >
        {warming ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />} Save for offline now
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
        Open the app once while online before you travel. Solves you time offline are kept on this device and sync when you&apos;re back online.
      </p>
    </div>
  );
}
