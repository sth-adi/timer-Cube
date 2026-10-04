"use client";

import { create } from "zustand";
import { OFFLINE_EXTRAS, OFFLINE_ROUTES } from "@/lib/offline/routes";

const WARMED_AT_KEY = "cube-timer:offline-warmed-at";
/** The worker's page cache that last warm filled. A new worker version starts with empty caches, so a different (missing) one means warm again now. */
const WARMED_CACHE_KEY = "cube-timer:offline-warmed-cache";
/** Re-check the saved copies at most this often; it only downloads what's new. */
const REWARM_AFTER_MS = 6 * 3_600_000;

interface OfflineState {
  /** The browser's own idea of whether there's a connection. */
  online: boolean;
  /** Every page has been saved on this device at least once. */
  ready: boolean;
  /** An offline worker is running here (production builds in browsers that support one). */
  available: boolean;
  /** A save requested with warmNow() is in progress. */
  warming: boolean;
  /** When the pages were last saved on this device (ms, epoch), if ever. */
  warmedAt: number | null;
  /** A newer version of the app has taken over the worker; this page is still running the old one until it reloads. */
  updateReady: boolean;
}

export const useOfflineStore = create<OfflineState>(() => ({ online: true, ready: false, available: false, warming: false, warmedAt: null, updateReady: false }));

/** A save that never reports back (worker killed, connection lost) stops showing as in progress after this. */
/** The bits of navigator.connection (Network Information API, not in lib.dom) used to decide on a background save. */
type ConnectionInfo = { saveData?: boolean; type?: string };

/**
 * True when the automatic background save should be skipped: data-saver is on, or the device is on
 * mobile data (the whole app is several MB). Only the automatic saves ask; "Save now" always runs.
 */
export function skipAutoWarm(conn: ConnectionInfo | undefined): boolean {
  return !!conn?.saveData || conn?.type === "cellular";
}

const WARM_TIMEOUT_MS = 2 * 60_000;
let warmTimer: number | undefined;

function stopWarming(): void {
  window.clearTimeout(warmTimer);
  warmTimer = undefined;
  useOfflineStore.setState({ warming: false });
}

/**
 * Saves every page on this device right now, ignoring the usual "at most every few hours" pause.
 * Does nothing (and returns false) where there is no offline worker — development builds, browsers
 * without support — or no connection to download over.
 */
export function warmNow(): boolean {
  const { available, warming } = useOfflineStore.getState();
  if (!available || !navigator.onLine) return false;
  if (warming) return true;
  useOfflineStore.setState({ warming: true });
  window.clearTimeout(warmTimer);
  warmTimer = window.setTimeout(stopWarming, WARM_TIMEOUT_MS);
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: "warm", routes: OFFLINE_ROUTES, extras: OFFLINE_EXTRAS }))
    .catch(stopWarming);
  return true;
}

function readWarmedAt(): number {
  try {
    return Number(localStorage.getItem(WARMED_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Whether the copies the last warm saved are gone — a new worker version drops the old caches on
 * taking over, which would otherwise leave pages unsaved until the next scheduled re-check.
 */
async function savedCopiesGone(): Promise<boolean> {
  let name: string | null = null;
  try {
    name = localStorage.getItem(WARMED_CACHE_KEY);
  } catch {
    // Unreadable: treated like a warm from before this was recorded.
  }
  if (!name) return true;
  try {
    return !(await caches.has(name));
  } catch {
    // Can't tell: keep to the usual schedule.
    return false;
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

  const saved = readWarmedAt();
  useOfflineStore.setState({ ready: saved > 0, warmedAt: saved > 0 ? saved : null, available: true });
  // A page opened with no worker at all is just being taken over for the first time, not updated.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "updated") {
      if (hadController) {
        useOfflineStore.setState({ updateReady: true });
        // The new worker started with empty caches: save the pages again rather than wait for a reload.
        if (!skipAutoWarm((navigator as Navigator & { connection?: ConnectionInfo }).connection)) window.setTimeout(() => void warmNow(), 2000);
      }
      return;
    }
    if (e.data?.type !== "warmed") return;
    const at = typeof e.data.at === "number" ? e.data.at : Date.now();
    try {
      localStorage.setItem(WARMED_AT_KEY, String(at));
      if (typeof e.data.cache === "string") localStorage.setItem(WARMED_CACHE_KEY, e.data.cache);
    } catch {
      // Without it the worker is simply asked again next visit.
    }
    stopWarming();
    useOfflineStore.setState({ ready: true, warmedAt: at });
  });

  void navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const conn = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
      const warmIfDue = async () => {
        if (!navigator.onLine || skipAutoWarm(conn)) return;
        if (Date.now() - readWarmedAt() < REWARM_AFTER_MS && !(await savedCopiesGone())) return;
        reg.active?.postMessage({ type: "warm", routes: OFFLINE_ROUTES, extras: OFFLINE_EXTRAS });
      };
      // Let the page that was asked for finish loading before downloading the rest of the app.
      window.setTimeout(() => void warmIfDue(), 4000);
      window.addEventListener("online", () => window.setTimeout(() => void warmIfDue(), 2000));
    })
    .catch(() => {
      // Offline support is an extra: a browser that blocks workers just works online as before.
    });
}
