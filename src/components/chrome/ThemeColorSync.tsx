"use client";

import { useEffect } from "react";
import { themeColorFor } from "@/lib/theme/themeColor";

function apply() {
  const color = themeColorFor(document.documentElement.dataset.theme);
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((m) => {
    if (m.content !== color) m.content = color;
  });
}

/**
 * Keeps the browser's theme colour (status bar tint) matching the active theme: the inline script in layout.tsx sets
 * it before first paint, this follows later changes of `<html data-theme>` (the settings sheet, another tab).
 */
export function ThemeColorSync() {
  useEffect(() => {
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
