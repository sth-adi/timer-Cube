"use client";

import { useEffect } from "react";
import { isTextField, keyAction } from "@/lib/timer/timerInput";

interface Handlers {
  press: () => void;
  release: () => void;
  cancel: () => void;
  reset?: () => void;
  /** False to ignore input entirely (e.g. a finished challenge). */
  enabled?: boolean;
}

/**
 * The one place the timer listens to input: space (ignoring auto-repeat and
 * text fields), Escape to reset, and — the cases that used to be missing —
 * the window losing focus mid-hold, where the keyup never arrives. Returns
 * touch handlers for the timer surface, including touchcancel, so an
 * interrupted touch (a system gesture, an incoming call) abandons the hold
 * instead of leaving the timer stuck or starting a solve.
 */
export function useTimerInput({ press, release, cancel, reset, enabled = true }: Handlers) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction({ type: e.type as "keydown" | "keyup", code: e.code, repeat: e.repeat, inField: isTextField(e.target) });
      if (!action) return;
      if (action === "reset" && !reset) return;
      e.preventDefault();
      if (action === "press") press();
      else if (action === "release") release();
      else reset?.();
    };
    const onBlur = () => cancel();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [press, release, cancel, reset, enabled]);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (!enabled) return;
      e.preventDefault();
      // A second finger landing mid-hold is just another touchstart; the
      // machine ignores presses while holding/ready.
      press();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!enabled) return;
      e.preventDefault();
      // Only the last finger lifting counts as a release.
      if (e.touches.length === 0) release();
    },
    onTouchCancel: () => {
      if (enabled) cancel();
    },
  };
}
