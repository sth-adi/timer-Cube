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
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}
