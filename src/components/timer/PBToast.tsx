"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { formatTime } from "@/lib/utils/time";
import { vibrate } from "@/lib/utils/haptics";
import { playPBChime } from "@/lib/utils/sound";
import { fxImpact } from "@/lib/fx/fxBus";
import { MomentToast } from "./MomentToast";

const LABEL: Record<string, string> = {
  single: "New personal best",
  ao5: "New best ao5",
  ao12: "New best ao12",
};

export const PB_TOAST_MS = 2800;

export function PBToast() {
  const lastPB = useSessionStore((s) => s.lastPB);
  const clearPB = useSessionStore((s) => s.clearPB);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);

  useEffect(() => {
    if (!lastPB) return;
    vibrate(lastPB.kind === "single" ? [40, 60, 80] : 50);
    if (soundEnabled) playPBChime();
    // The FX layer decides how much a best gets: nothing when flat, a gold wash and a few sparks at
    // Spicy, the full shockwave at Insane (and nothing that moves under reduced motion).
    if (lastPB.kind === "single") fxImpact("pb");
    const t = setTimeout(() => clearPB(), PB_TOAST_MS);
    return () => clearTimeout(t);
    // Only a new best should fire this — flipping the sound setting while one is up must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPB, clearPB]);

  return (
    <div className="moment-toast-wrap">
      <AnimatePresence>
        {lastPB && (
          <MomentToast
            key={lastPB.id}
            tone="gold"
            icon={<Trophy size={18} strokeWidth={2.4} />}
            eyebrow={LABEL[lastPB.kind]}
            durationMs={PB_TOAST_MS}
            spoken={`${LABEL[lastPB.kind]}: ${formatTime(lastPB.ms)}`}
          >
            <span className="moment-toast__value">{formatTime(lastPB.ms)}</span>
          </MomentToast>
        )}
      </AnimatePresence>
    </div>
  );
}
