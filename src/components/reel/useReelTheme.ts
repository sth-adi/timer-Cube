"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CubeLook } from "@/lib/cube3d/look";
import { preloadCubeLayer } from "@/lib/reel/cubeLayer";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { DEFAULT_MONO, DEFAULT_SANS, readReelTheme, type ReelTheme } from "@/lib/reel/theme";

const SEP = "\u0001";
const SERVER = ["#7c5cff", DEFAULT_SANS, DEFAULT_MONO].join(SEP);

/** Re-reads the theme when <html> changes its theme or effects attributes (settings, another tab's change). */
function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  return () => mo.disconnect();
}

function snapshot(): string {
  const t = readReelTheme();
  return [t.accent, t.sans, t.mono].join(SEP);
}

/**
 * The reel's accent and fonts, read from the page once per theme change — never per frame (reading
 * computed style while painting would force a style recalculation 60 times a second).
 */
export function useReelTheme(): ReelTheme & { look: CubeLook; cube3d: boolean } {
  const look = useSettingsStore((s) => s.cubeLook);
  // three.js loads lazily: start it as the reel page mounts, and redraw (a new theme object) once the 3D cube can be drawn.
  const [cube3d, setCube3d] = useState(false);
  useEffect(() => {
    let live = true;
    void preloadCubeLayer().then((ok) => live && setCube3d(ok));
    return () => {
      live = false;
    };
  }, []);
  const key = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  return useMemo(() => {
    const [accent, sans, mono] = key.split(SEP);
    return { accent, sans, mono, look, cube3d };
  }, [key, look, cube3d]);
}
