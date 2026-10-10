"use client";

import { useEffect, useState } from "react";

/**
 * A replay position that moves every animation frame. The player reports its position about every 80 ms,
 * which would tick a clock at 12 fps; between reports this carries on from the last one at the playback
 * rate (never past `endMs`). Paused, it is the reported position itself.
 */
export function useSmoothPosition(positionMs: number, playing: boolean, speed: number, endMs: number): number {
  // The frame's value, tagged with the report it grew from so a newer report is never shown a frame late.
  const [frame, setFrame] = useState<{ from: number; value: number } | null>(null);
  useEffect(() => {
    if (!playing) return undefined;
    const began = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setFrame({ from: positionMs, value: Math.min(endMs, positionMs + (now - began) * speed) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [positionMs, playing, speed, endMs]);
  return playing && frame && frame.from === positionMs ? Math.max(positionMs, frame.value) : positionMs;
}
