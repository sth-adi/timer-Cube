"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { formatTime } from "@/lib/utils/time";

const LABEL: Record<string, string> = {
  single: "New personal best!",
  ao5: "New best ao5!",
  ao12: "New best ao12!",
};

export function PBToast() {
  const lastPB = useSessionStore((s) => s.lastPB);
  const clearPB = useSessionStore((s) => s.clearPB);

  useEffect(() => {
    if (!lastPB) return;
    const t = setTimeout(() => clearPB(), 2800);
    return () => clearTimeout(t);
  }, [lastPB, clearPB]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
      <AnimatePresence>
        {lastPB && (
          <motion.div
            key={lastPB.id}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning shadow-lg backdrop-blur"
          >
            <Trophy size={15} />
            {LABEL[lastPB.kind]} {formatTime(lastPB.ms)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
