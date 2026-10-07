"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useSettingsStore } from "@/lib/store/settingsStore";
import "@/styles/moments.css";

/**
 * The one look for the toasts a solve can raise (a new best, a milestone): an icon tile, a small
 * caps line and the content, a hairline counting down how long it stays, one pass of light when it
 * lands. Position and stacking live in styles/moments.css; this only animates in and out, which it
 * does with opacity alone under reduced motion or the flat FX level.
 */
export function MomentToast({
  tone,
  icon,
  eyebrow,
  children,
  durationMs,
  spoken,
}: {
  tone: "gold" | "accent";
  icon: ReactNode;
  eyebrow: string;
  children: ReactNode;
  /** How long the toast stays — drives the hairline. */
  durationMs: number;
  /** What a screen reader hears (the visible text is split across lines). */
  spoken: string;
}) {
  const fxLevel = useSettingsStore((s) => s.fxLevel);
  const reduced = useReducedMotion();
  const still = reduced || fxLevel === "off";
  return (
    <motion.div
      role="status"
      aria-label={spoken}
      initial={{ opacity: 0, y: still ? 0 : 14, scale: still ? 1 : 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: still ? 0 : 8, scale: still ? 1 : 0.98 }}
      transition={still ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 32 }}
      className={tone === "gold" ? "moment-toast moment-toast--gold" : "moment-toast"}
      style={{ ["--moment-life" as string]: `${durationMs}ms` }}
    >
      <span className="moment-toast__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="moment-toast__body" aria-hidden="true">
        <span className="moment-toast__eyebrow">{eyebrow}</span>
        {children}
      </span>
      <span className="moment-toast__life" aria-hidden="true" />
    </motion.div>
  );
}
