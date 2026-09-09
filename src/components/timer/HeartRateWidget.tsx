"use client";

import { Heart, HeartCrack, Loader2 } from "lucide-react";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { cn } from "@/lib/utils/cn";

/**
 * A standard BLE Heart Rate strap (chest straps, most fitness watches) —
 * not cube-specific hardware. Live BPM shown here is purely informational;
 * the actual per-solve avg/max gets attached to the solve automatically by
 * whichever timer view is active, via useHeartRateStore.summarize().
 */
export function HeartRateWidget() {
  const { supported, connecting, connected, deviceName, bpm, error, connect, disconnect } = useHeartRateStore();

  if (!supported) return null;

  if (!connected) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        title={error ?? "Connect a BLE heart-rate monitor"}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-2 hover:text-muted disabled:opacity-50"
      >
        {connecting ? <Loader2 size={11} className="animate-spin" /> : <HeartCrack size={11} />}
        {connecting ? "Connecting…" : "Heart rate"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={disconnect}
      title={`${deviceName} — click to disconnect`}
      className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger"
    >
      <Heart size={11} className={cn(bpm !== null && "animate-pulse")} fill="currentColor" />
      {bpm ?? "…"} bpm
    </button>
  );
}
