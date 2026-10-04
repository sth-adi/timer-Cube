"use client";

import { useEffect } from "react";
import { detectBrowserEnv, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { applyDeviceFxDefault } from "@/lib/store/settingsStore";

/**
 * Reads what only the browser knows — whether Web Bluetooth exists, which cube
 * was used last — into the stores once the page has hydrated. Doing it when
 * the stores are created would make the server-rendered HTML (which can't
 * know) disagree with the client's first render, and React would throw the
 * server's markup away. Until this runs `supported` is null (unknown), so the
 * server-rendered HTML shows a neutral state rather than "unavailable".
 */
export function ClientEnv() {
  useEffect(() => {
    // One setState for both, so "Connect" and "Reconnect <cube>" appear together; until then supported is null (unknown), not false.
    const env = detectBrowserEnv();
    useSmartCubeStore.setState(env);
    useHeartRateStore.setState({ supported: env.supported });
    applyDeviceFxDefault();
  }, []);
  return null;
}
