"use client";

import { create } from "zustand";
import { OFFLINE_EXTRAS, OFFLINE_ROUTES } from "@/lib/offline/routes";

const WARMED_AT_KEY = "cube-timer:offline-warmed-at";
/** Re-check the saved copies at most this often; it only downloads what's new. */
const REWARM_AFTER_MS = 6 * 3_600_000;

interface OfflineState {
  /** The browser's own idea of whether there's a connection. */
  online: boolean;
  /** Every page has been saved on this device at least once. */
  ready: boolean;
}

export const useOfflineStore = create<OfflineState>(() => ({ online: true, ready: false }));

function readWarmedAt(): number {
  try {
    return Number(localStorage.getItem(WARMED_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

let started = false;

/**
 * Registers the offline worker (production builds only — in development the worker would serve
 * stale scripts, so any leftover one is removed instead), tracks connectivity, and asks the worker
 * to save every page once the app has settled.
 */
export function initOffline(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const setOnline = () => useOfflineStore.setState({ online: navigator.onLine });
  setOnline();
  window.addEventListener("online", setOnline);
  window.addEventListener("offline", setOnline);

  if (!("serviceWorker" in navigator)) return;

  if (process.env.NODE_ENV !== "production") {
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
    return;
  }

  useOfflineStore.setState({ ready: readWarmedAt() > 0 });
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type !== "warmed") return;
    try {
      localStorage.setItem(WARMED_AT_KEY, String(e.data.at ?? Date.now()));
    } catch {
      // Without it the worker is simply asked again next visit.
    }
    useOfflineStore.setState({ ready: true });
  });

  void navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      const warmIfDue = () => {
        if (!navigator.onLine || conn?.saveData) return;
        if (Date.now() - readWarmedAt() < REWARM_AFTER_MS) return;
        reg.active?.postMessage({ type: "warm", routes: OFFLINE_ROUTES, extras: OFFLINE_EXTRAS });
      };
      // Let the page that was asked for finish loading before downloading the rest of the app.
      window.setTimeout(warmIfDue, 4000);
      window.addEventListener("online", () => window.setTimeout(warmIfDue, 2000));
    })
    .catch(() => {
      // Offline support is an extra: a browser that blocks workers just works online as before.
    });
}
