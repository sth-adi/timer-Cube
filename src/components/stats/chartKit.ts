"use client";

import { useEffect, useState } from "react";

/**
 * The rendered width (px) of an element, kept current as it resizes — so a chart can draw in real pixels (crisp 2px lines,
 * 11px labels) instead of scaling a fixed viewBox down to a phone. Use as `<div ref={setEl}>`; `fallback` is used until measured.
 */
export function useElementWidth(fallback = 336): [(el: HTMLElement | null) => void, number, HTMLElement | null] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width, el];
}

/** While `active`, a press anywhere outside `el` calls `onDismiss` — how a touch selection is put away again. */
export function useDismissOutside(el: Element | null, active: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!active || !el) return;
    const away = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [el, active, onDismiss]);
}
