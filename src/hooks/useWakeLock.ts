"use client";

import { useEffect } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen on while `active` — a phone or tablet that dims and
 * sleeps in the middle of a practice session takes the Bluetooth link with
 * it. The browser drops the lock whenever the tab is hidden, so it's asked
 * for again when the tab comes back. Quietly does nothing where unsupported
 * or refused (low battery, a locked-down browser).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !api) return undefined;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await api.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        // The browser drops it whenever the tab is hidden: forget our handle so coming back asks again.
        (lock as unknown as EventTarget).addEventListener?.("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Refused — not worth a message.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}
