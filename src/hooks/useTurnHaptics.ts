"use client";

import { useEffect } from "react";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { createTickLimiter, HAPTIC_PATTERNS, patternDurationMs, solveHapticFor } from "@/lib/utils/hapticsModel";
import { getHapticsLevel, haptic } from "@/lib/utils/haptics";

/**
 * Tactile feedback for a live smart-cube solve: a faint tick per turn (Full
 * level only, rate-limited), a short pattern when the cross, F2L, OLL or a
 * single F2L pair is done, and a longer one at the finish. Mounted once from
 * AppBootstrap; it reads the level on every event, so changing it needs no
 * re-subscribe, and it does nothing where the browser can't vibrate.
 */
export function useTurnHaptics(): void {
  useEffect(() => {
    const limiter = createTickLimiter();

    // The store applies a milestone before the bus announces the turn that
    // caused it, and a second vibrate() cuts the first short, so the tick for
    // that turn waits for the phase pattern to play out.
    const unsubStore = useSmartCubeStore.subscribe((next, prev) => {
      const kind = solveHapticFor(prev, next);
      if (kind === null) return;
      if (haptic(kind)) limiter.hold(performance.now() + patternDurationMs(HAPTIC_PATTERNS[kind]) + 20);
    });

    const unsubMoves = subscribeRawMoves(() => {
      if (getHapticsLevel() !== "full") return;
      if (!useSmartCubeStore.getState().recording) return;
      if (limiter.allow(performance.now())) haptic("turn");
    });

    return () => {
      unsubStore();
      unsubMoves();
    };
  }, []);
}
