"use client";

import { useEffect, useState } from "react";
import { exitDelayMs, SHEET_EXIT_MS } from "./motionMath";
import { motionIsOff } from "./motionOff";

/**
 * Keeps a sheet or dialog mounted while it plays its exit animation.
 *
 *   const sheet = usePresence(open);
 *   {sheet.present && <MySheet closing={!open} ... />}
 *
 * `present` is true while `open`, and for one exit animation after it turns
 * false (immediately gone when motion is off). Reopening mid-exit just keeps
 * it mounted. Style the sheet with the `.mo-sheet` / `.mo-backdrop` classes in
 * src/styles/motion.css, setting `data-mo="exit"` while `closing`.
 */
export function usePresence(open: boolean, exitMs: number = SHEET_EXIT_MS): { present: boolean } {
  const [lingering, setLingering] = useState(open);
  // Derived from props during render (not in an effect), so a reopen never shows a frame without the sheet.
  if (open && !lingering) setLingering(true);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setLingering(false), exitDelayMs(exitMs, motionIsOff()));
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { present: open || lingering };
}
