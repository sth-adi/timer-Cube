"use client";

import { useEffect } from "react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { readLastCube } from "@/lib/smartcube/connectMemory";

/**
 * Reads what only the browser knows — whether Web Bluetooth exists, which cube
 * was used last — into the stores once the page has hydrated. Doing it when
 * the stores are created would make the server-rendered HTML (which can't
 * know) disagree with the client's first render, and React would throw the
 * server's markup away.
 */
export function ClientEnv() {
  useEffect(() => {
    const bluetooth = "bluetooth" in navigator;
    useSmartCubeStore.setState({ supported: bluetooth, lastCubeName: readLastCube() });
    useHeartRateStore.setState({ supported: bluetooth });
  }, []);
  return null;
}
