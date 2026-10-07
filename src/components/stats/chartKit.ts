"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Keyboard stepping for a chart of `count` equal slots (bars, blocks): arrows, Home and End move the selection, Escape
 * clears it, and `describe(i)` is announced politely for a screen reader. The selection is put away again when focus
 * leaves, but only if it came from the keyboard (a pointer selection is dismissed by its own handlers).
 */
export function useSlotKeys(count: number, active: number | null, setActive: (i: number | null) => void, describe: (i: number) => string) {
  const fromKeys = useRef(false);
  const [announce, setAnnounce] = useState("");
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key) || count === 0) return;
    e.preventDefault();
    fromKeys.current = true;
    if (e.key === "Escape") return setActive(null);
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : Math.min(count - 1, Math.max(0, (active ?? (step > 0 ? -1 : count)) + step));
    setActive(next);
    setAnnounce(describe(next));
  };
  const onBlur = () => {
    if (fromKeys.current) setActive(null);
  };
  const onPointerDown = () => {
    fromKeys.current = false;
  };
  return { onKeyDown, onBlur, onPointerDown, announce };
}
