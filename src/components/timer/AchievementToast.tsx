"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/lib/store/sessionStore";
import { vibrate } from "@/lib/utils/haptics";
import { MomentToast } from "./MomentToast";

export const ACHIEVEMENT_TOAST_MS = 3200;

export function AchievementToast() {
  const achievementToast = useSessionStore((s) => s.achievementToast);
  const clearAchievementToast = useSessionStore((s) => s.clearAchievementToast);
  // A new best raised by the same save is announced first; the milestone follows it into the same
  // spot instead of stacking over the recap (the splits and the Replay bar sit right behind it).
  const pbShowing = useSessionStore((s) => s.lastPB !== null);
  const shown = achievementToast !== null && !pbShowing;

  useEffect(() => {
    if (!shown) return;
    vibrate([30, 40, 30, 40, 60]);
    const t = setTimeout(() => clearAchievementToast(), ACHIEVEMENT_TOAST_MS);
    return () => clearTimeout(t);
  }, [shown, achievementToast, clearAchievementToast]);

  return (
    <div className="moment-toast-wrap">
      <AnimatePresence>
        {shown && achievementToast && (
          <MomentToast
            key={achievementToast.toastId}
            tone="accent"
            icon={<span>{achievementToast.icon}</span>}
            eyebrow="Milestone unlocked"
            durationMs={ACHIEVEMENT_TOAST_MS}
            spoken={`Milestone unlocked: ${achievementToast.label}`}
          >
            <span className="moment-toast__label">{achievementToast.label}</span>
          </MomentToast>
        )}
      </AnimatePresence>
    </div>
  );
}
