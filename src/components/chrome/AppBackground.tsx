"use client";

import { useMemo } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { AuroraBackground } from "./AuroraBackground";

const PARTICLE_COUNT = 18;

/** Small deterministic PRNG (mulberry32) so particle layout is stable across re-renders without a `useState`/effect round-trip. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ParticlesBackground() {
  const particles = useMemo(() => {
    const rand = mulberry32(20260912);
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      key: i,
      px: `${(rand() * 100).toFixed(1)}%`,
      py: `${(rand() * 100).toFixed(1)}%`,
      size: `${(3 + rand() * 6).toFixed(1)}px`,
      duration: `${(14 + rand() * 14).toFixed(1)}s`,
      delay: `${(-rand() * 20).toFixed(1)}s`,
      dx: `${(rand() * 40 - 20).toFixed(0)}px`,
      dy: `${(rand() * 50 - 40).toFixed(0)}px`,
    }));
  }, []);

  return (
    <div className="particles-layer" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.key}
          className="particle-dot"
          style={
            {
              "--px": p.px,
              "--py": p.py,
              "--size": p.size,
              "--duration": p.duration,
              "--delay": p.delay,
              "--dx": p.dx,
              "--dy": p.dy,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function WavesBackground() {
  return (
    <div className="waves-layer" aria-hidden="true">
      <div className="wave wave-a" />
      <div className="wave wave-b" />
    </div>
  );
}

/**
 * Picks one of settingsStore.ts's BACKGROUND_STYLES. "aurora" keeps the
 * original component (it's also wired to the live pace-color bus during a
 * solve — see AuroraBackground.tsx — which the purely decorative
 * alternatives here don't attempt to replicate). "minimal" renders nothing:
 * just the theme's flat background color, no layer at all.
 */
export function AppBackground() {
  const backgroundStyle = useSettingsStore((s) => s.backgroundStyle);
  switch (backgroundStyle) {
    case "aurora":
      return <AuroraBackground />;
    case "grid":
      return <div className="grid-layer" aria-hidden="true" />;
    case "particles":
      return <ParticlesBackground />;
    case "waves":
      return <WavesBackground />;
    case "minimal":
      return null;
  }
}
