"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSessionStore } from "@/lib/store/sessionStore";
import { vibrate } from "@/lib/utils/haptics";

export function AchievementToast() {
  const achievementToast = useSessionStore((s) => s.achievementToast);
  const clearAchievementToast = useSessionStore((s) => s.clearAchievementToast);

  useEffect(() => {
    if (!achievementToast) return;
    vibrate([30, 40, 30, 40, 60]);
    const t = setTimeout(() => clearAchievementToast(), 3200);
    return () => clearTimeout(t);
  }, [achievementToast, clearAchievementToast]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 72px)" }}
    >
      <AnimatePresence>
        {achievementToast && (
          <motion.div
            key={achievementToast.toastId}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-medium text-accent shadow-lg backdrop-blur"
          >
            <span className="text-base leading-none">{achievementToast.icon}</span>
            Milestone unlocked: {achievementToast.label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
