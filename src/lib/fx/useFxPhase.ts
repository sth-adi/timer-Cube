"use client";

import { useEffect } from "react";
import { setFxPhase, type FxPhase } from "./fxBus";

/** Mirrors a timer's phase into the global FX layer for as long as the calling component is mounted. */
export function useFxPhase(phase: FxPhase): void {
  useEffect(() => {
    setFxPhase(phase);
  }, [phase]);
  useEffect(() => () => setFxPhase("idle"), []);
}
