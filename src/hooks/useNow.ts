"use client";

import { useEffect, useState } from "react";

/**
 * A wall-clock timestamp (`Date.now()`) refreshed every `intervalMs` (default 30 s) — enough for
 * "3 min ago" labels to stay roughly right without re-rendering on every frame like useNowTick.
 * The clock is read in the lazy initializer and the interval callback only, never during render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
