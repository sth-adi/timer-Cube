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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}
