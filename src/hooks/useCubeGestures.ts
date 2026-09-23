"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { GestureDetector, bindingFor, type GestureAction, type GestureId } from "@/lib/smartcube/gestures";

export interface GestureToast {
  id: number;
  gesture: GestureId;
  label: string;
  /** False when the gesture was recognized but had nothing to act on (e.g. no solve to +2 yet). */
  ok: boolean;
}

/**
 * Listens to every raw turn from the connected cube and fires `handlers`
 * when a gesture completes (see lib/smartcube/gestures.ts). Disabled while a
 * solve is armed or recording — mid-solve, four U turns are just four U
 * turns — and when the setting is off.
 *
 * Each handler returns the text to confirm with, or null if it had nothing
 * to act on; the hook turns that into a short-lived toast.
 */
export function useCubeGestures(handlers: Record<GestureAction, () => string | null>): GestureToast | null {
  const enabled = useSettingsStore((s) => s.cubeGestures);
  const [toast, setToast] = useState<GestureToast | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const detector = new GestureDetector();
    let id = 0;
    return subscribeRawMoves((move) => {
      const { armed, recording } = useSmartCubeStore.getState();
      if (armed || recording) {
        detector.reset();
        return;
      }
      const gesture = detector.push(move);
      if (!gesture) return;
      const binding = bindingFor(gesture);
      if (!binding) return;
      const result = handlersRef.current[binding.action]();
      setToast({ id: ++id, gesture, label: result ?? `${binding.label} — nothing to do`, ok: result !== null });
    });
  }, [enabled]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  return toast;
}
