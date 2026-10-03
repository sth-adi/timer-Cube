"use client";

import { useEffect } from "react";
import { isTextField, keyAction } from "@/lib/timer/timerInput";

interface Handlers {
  press: (at?: number) => void;
  release: (at?: number) => void;
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
 * instead of leaving the timer stuck or starting a solve. Press and release
 * pass the event's own timeStamp, so a handler that runs late (busy main
 * thread) doesn't inflate the time.
 */
export function useTimerInput({ press, release, cancel, reset, enabled = true }: Handlers) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const inField = isTextField(e.target);
      const action = keyAction({ type: e.type as "keydown" | "keyup", code: e.code, repeat: e.repeat, inField });
      // Auto-repeated Space does nothing to the timer, but must still not scroll the page or click a focused button.
      if (e.code === "Space" && !inField) e.preventDefault();
      if (!action) return;
      if (action === "reset" && !reset) return;
      e.preventDefault();
      if (action === "press") press(e.timeStamp);
      else if (action === "release") release(e.timeStamp);
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
      // A tap on a control inside the timer surface (a button, a link, a
      // [data-no-timer] area) is for that control: no timer press, and no
      // preventDefault, which would swallow its click.
      if (isOwnControl(e)) return;
      e.preventDefault();
      // A second finger landing mid-hold is just another touchstart; the
      // machine ignores presses while holding/ready.
      press(e.nativeEvent.timeStamp);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!enabled) return;
      // Let a control's tap become a click. Still fall through to release:
      // if another finger began a hold on the surface and this was the last
      // one up, the hold must end (release is a no-op when nothing is held).
      if (!isOwnControl(e)) e.preventDefault();
      // Only the last finger lifting counts as a release.
      if (e.touches.length === 0) release(e.nativeEvent.timeStamp);
    },
    onTouchCancel: () => {
      if (enabled) cancel();
    },
  };
}

/** Touches inside these, within the timer surface, belong to the element, not the timer. */
const CONTROL_SELECTOR = "button, a[href], input, select, textarea, label, [data-no-timer]";

/** Whether the touch landed on an interactive descendant of the surface (never the surface itself, which is role="button"). */
function isOwnControl(e: React.TouchEvent): boolean {
  const target = e.target as Element | null;
  const control = target?.closest?.(CONTROL_SELECTOR);
  return !!control && control !== e.currentTarget && e.currentTarget.contains(control);
}
