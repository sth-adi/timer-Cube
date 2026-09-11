"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A continuously-updating `performance.now()` reading while `active` is
 * true, driven by requestAnimationFrame — the same mechanism useTimer.ts
 * uses for the keyboard timer's own live display. Returns 0 while inactive
 * (including the very first render before the loop's first frame lands).
 */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Reset to 0 the instant `active` goes false — React's own "reset state
  // when a prop changes" pattern (compare during render, not in an effect),
  // so the loop below never has to setState synchronously on its own exit.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setNow(0);
  }

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      setNow(performance.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active]);

  return now;
}
