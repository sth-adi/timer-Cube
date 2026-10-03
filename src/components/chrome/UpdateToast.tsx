"use client";

import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { useOfflineStore } from "@/lib/store/offlineStore";
import { getFxPhase, subscribeFx } from "@/lib/fx/fxBus";

const subscribePhase = (onChange: () => void) => subscribeFx((e) => e.type === "phase" && onChange());
const serverPhase = () => "idle" as const;

/**
 * "New version ready — Reload", once the offline worker has been replaced by a newer build. It only
 * offers: the page is never reloaded for you, and the toast stays out of sight while a solve is
 * being timed (inspection through the stopped clock), so an update can't land mid-solve.
 */
export function UpdateToast() {
  const updateReady = useOfflineStore((s) => s.updateReady);
  const phase = useSyncExternalStore(subscribePhase, getFxPhase, serverPhase);
  if (!updateReady || (phase !== "idle" && phase !== "stopped")) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4" style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 112px)" }}>
      <div role="status" className="card pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg" data-testid="update-toast">
        <span className="text-foreground">New version ready</span>
        <button type="button" onClick={() => window.location.reload()} className="flex items-center gap-1 font-semibold text-accent hover:underline">
          <RefreshCw size={14} /> Reload
        </button>
      </div>
    </div>
  );
}
