"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_HAPTICS_LEVEL, type HapticsLevel } from "@/lib/utils/hapticsModel";
import { getHapticsLevel, setHapticsLevel, subscribeHapticsLevel } from "@/lib/utils/haptics";

/** The saved haptics level (Off / Light / Full) and a setter; the server and first paint show the default. */
export function useHapticsLevel(): [HapticsLevel, (next: HapticsLevel) => void] {
  const level = useSyncExternalStore(subscribeHapticsLevel, getHapticsLevel, () => DEFAULT_HAPTICS_LEVEL);
  const set = useCallback((next: HapticsLevel) => setHapticsLevel(next), []);
  return [level, set];
}
