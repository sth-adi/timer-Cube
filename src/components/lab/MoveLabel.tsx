"use client";

import { useEffect, useRef } from "react";
import "@/styles/twinoverlay.css";
import { motionIsOff } from "@/components/motion/motionOff";

/** How long a label stays up; the last part of it is the fade. */
export const MOVE_LABEL_MS = 400;

/**
 * The move being turned ("R'", "M", "x"), as plain text floating above a twin: it appears the moment the turn
 * starts and fades away over 400 ms. Mount it with a new `nonce` for each turn (the same move twice in a row
 * still replays it). It must sit in a `position: relative` box; it is decorative, so hidden from screen
 * readers. With reduced motion or effects off it holds steady for the same time instead of fading.
 */
export function MoveLabel({ label, nonce, size }: { label: string; nonce: number; size: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const steady = motionIsOff();
    const anim = el.animate(steady ? [{ opacity: 0.9 }, { opacity: 0.9 }] : [{ opacity: 0.95 }, { opacity: 0.95, offset: 0.3 }, { opacity: 0 }], {
      duration: MOVE_LABEL_MS,
      easing: "ease-out",
    });
    return () => anim.cancel();
  }, [nonce]);
  return (
    <span ref={ref} key={nonce} aria-hidden="true" className="tw-move-label font-mono" style={{ fontSize: Math.max(10, Math.min(15, size * 0.14)) }}>
      {label}
    </span>
  );
}
