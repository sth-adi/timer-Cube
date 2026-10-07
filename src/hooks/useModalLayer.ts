"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isTopModalLayer, openModalLayer } from "@/lib/store/modalBus";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  // Hidden controls (display: none, e.g. the file input) have no layout boxes and can't take focus.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/**
 * Everything a modal dialog or sheet needs, for as long as it's mounted:
 * the shared "modal open" flag (timer keys and global shortcuts stand down,
 * see lib/store/modalBus.ts), Escape to close, focus moved into `ref`'s
 * element on open and handed back on close, and Tab kept inside it.
 *
 * `ref` should point at the dialog element, which gets tabIndex={-1} so it can
 * take focus itself. Escape is skipped when something inside already handled
 * it (defaultPrevented), and only the topmost open layer answers it.
 *
 * `active` (default true) lets a sheet that plays an exit animation hand the
 * keyboard back the moment it starts closing, while it is still mounted:
 * pass false then and the layer closes and focus is restored right away.
 */
export function useModalLayer(ref: RefObject<HTMLElement | null>, onClose: () => void, active: boolean = true): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    const layer = openModalLayer();
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus the dialog itself rather than its first control: screen readers announce the label, and Tab then goes to the first control.
    root?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopModalLayer(layer.token) || !root) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusablesIn(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active) || active === root) {
        // Focus has wandered out (or sits on the dialog itself): pull it back to an end.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      layer.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
