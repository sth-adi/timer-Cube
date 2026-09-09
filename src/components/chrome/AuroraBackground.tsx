"use client";

import { useEffect, useRef } from "react";
import { subscribePerformanceAura } from "@/lib/store/performanceAuraBus";

/** Rotates the theme's aurora hue toward cool/green ("ahead") or warm/red ("behind"), scaled by how far off pace. */
const HUE_AHEAD_DEG = -35;
const HUE_BEHIND_DEG = 130;

/**
 * Two slowly drifting, theme-tinted blobs behind the whole app, plus a
 * vignette so they read as depth rather than haze. Pure CSS (see
 * globals.css) for the baseline look — no canvas, no per-frame JS, and it
 * flattens automatically under prefers-reduced-motion.
 *
 * On top of that, it's a live pace indicator: while a solve is running, it
 * subscribes to lib/store/performanceAuraBus (fed by TimerView, using the
 * predictive model and/or your PB as a target) and nudges hue/saturation/
 * drift speed toward "ahead" (cooler, faster) or "behind" (warmer, more
 * urgent) — all via CSS custom properties written directly to the DOM, so
 * it never triggers a React re-render on every animation frame.
 */
export function AuroraBackground() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribePerformanceAura(({ status, intensity }) => {
      const el = layerRef.current;
      if (!el) return;
      if (status === null) {
        el.style.removeProperty("--aurora-pace-hue");
        el.style.removeProperty("--aurora-pace-sat");
        el.style.removeProperty("--aurora-pace-speed");
        return;
      }
      const hue = status === "ahead" ? HUE_AHEAD_DEG * intensity : status === "behind" ? HUE_BEHIND_DEG * intensity : 0;
      el.style.setProperty("--aurora-pace-hue", `${hue}deg`);
      el.style.setProperty("--aurora-pace-sat", `${1 + intensity * 0.6}`);
      el.style.setProperty("--aurora-pace-speed", `${1 + intensity * (status === "behind" ? 1.2 : 0.5)}`);
    });
  }, []);

  return (
    <div ref={layerRef} className="aurora-layer" aria-hidden="true">
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-vignette" />
    </div>
  );
}
