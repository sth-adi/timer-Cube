"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSettingsStore } from "@/lib/store/settingsStore";

export function AppBootstrap() {
  const initSessions = useSessionStore((s) => s.init);
  const initScramble = useScrambleStore((s) => s.init);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    void initSessions();
    void initScramble();
  }, [initSessions, initScramble]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a nice-to-have, not a hard requirement — a
        // failed registration (unsupported browser, blocked by settings)
        // should never break the app.
      });
    }
  }, []);

  // Every deploy renames the JS chunks (hashed filenames). A tab that's been
  // sitting open — or one restored from a stale service-worker/HTTP cache —
  // can still be holding an old HTML shell that references chunk names the
  // server no longer has, so any dynamic import (every route/component
  // loaded via next/dynamic, which this app uses heavily for the 3D viewer,
  // trainer, analyzer, etc.) 404s. That's a "loads, then breaks almost
  // immediately" failure with no useful on-screen error — indistinguishable
  // from a crash to whoever's holding the phone. The fix used industry-wide
  // for this exact class of bug: detect it and reload once to pick up the
  // current shell, rather than leave the user stuck on a dead page.
  useEffect(() => {
    const RELOAD_GUARD_KEY = "cube-timer:chunk-reload-at";
    const recentlyReloaded = () => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
      } catch {
        // Storage unavailable (private mode, quota) — treat as "not recent".
      }
      return Date.now() - last < 10_000;
    };
    const reloadOnce = () => {
      if (recentlyReloaded()) return; // Already tried — a real network outage, not a stale chunk.
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        // Still worth one attempt even if we can't record the guard.
      }
      window.location.reload();
    };
    const looksLikeChunkFailure = (message: string) =>
      /loading chunk|failed to fetch dynamically imported module|failed to import|chunkloaderror/i.test(message);

    const onError = (e: ErrorEvent) => {
      if (looksLikeChunkFailure(e.message ?? "")) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
      if (looksLikeChunkFailure(message)) reloadOnce();
    };
    // Resource load errors (a <script src="/_next/static/chunks/..."> 404)
    // don't bubble, so this one needs the capture phase to see them at all.
    const onResourceError = (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLScriptElement && target.src.includes("/_next/static/chunks/")) {
        reloadOnce();
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onResourceError, true);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResourceError, true);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}
