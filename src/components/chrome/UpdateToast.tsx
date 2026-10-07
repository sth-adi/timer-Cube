"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
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
    <div className="chrome-toast-wrap" style={{ "--slot": 2 } as CSSProperties}>
      <div role="status" className="chrome-toast glass-panel" data-testid="update-toast">
        <span>New version ready</span>
        <button type="button" onClick={() => window.location.reload()} className="chrome-toast__action hit-y">
          <RefreshCw size={14} aria-hidden="true" /> Reload
        </button>
      </div>
    </div>
  );
}
