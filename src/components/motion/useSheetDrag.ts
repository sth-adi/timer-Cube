"use client";

import { useRef, type PointerEvent, type RefObject } from "react";
import { dragOffset, shouldDismissDrag } from "./motionMath";

const SNAP_BACK = "transform 180ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Drag-down-to-dismiss for a bottom sheet: spread the returned handlers on its
 * grab handle (give it `touch-none`). The sheet follows the finger with a
 * transform (no layout), springs back if let go early, and otherwise calls
 * `onDismiss` — leaving the transform in place, so the exit animation
 * continues from where the finger left it.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, onDismiss: () => void) {
  const drag = useRef<{ id: number; startY: number; startAt: number; dy: number } | null>(null);

  const finish = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!el) return;
    const dismiss = !cancelled && shouldDismissDrag({ dy: d.dy, dtMs: performance.now() - d.startAt, heightPx: el.offsetHeight });
    if (dismiss) {
      onDismiss();
      return;
    }
    el.style.transition = SNAP_BACK;
    el.style.transform = "";
    window.setTimeout(() => {
      if (sheetRef.current === el) el.style.transition = "";
    }, 200);
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { id: e.pointerId, startY: e.clientY, startAt: performance.now(), dy: 0 };
      if (sheetRef.current) sheetRef.current.style.transition = "none";
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      const el = sheetRef.current;
      if (!d || d.id !== e.pointerId || !el) return;
      d.dy = dragOffset(e.clientY - d.startY);
      el.style.transform = `translate3d(0, ${d.dy}px, 0)`;
    },
    onPointerUp: (e: PointerEvent) => finish(e, false),
    onPointerCancel: (e: PointerEvent) => finish(e, true),
  };
}
