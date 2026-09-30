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

const CUBE_COUNT = 9;
const FACES = ["f", "b", "r", "l", "u", "d"] as const;

/** Sticker-coloured 3D cubes tumbling at different depths, parallaxing against the pointer (see FxLayer). */
function CubesBackground() {
  const cubes = useMemo(() => {
    const rand = mulberry32(777001);
    return Array.from({ length: CUBE_COUNT }, (_, i) => {
      const depth = 0.25 + rand() * 0.75;
      return {
        key: i,
        left: `${(rand() * 92 + 2).toFixed(1)}%`,
        top: `${(rand() * 88 + 2).toFixed(1)}%`,
        size: `${Math.round(40 + depth * 84)}px`,
        depth: Math.round(14 + depth * 46),
        blur: `${((1 - depth) * 3.2).toFixed(1)}px`,
        opacity: (0.1 + depth * 0.2).toFixed(2),
        float: `${(16 + rand() * 18).toFixed(1)}s`,
        tumble: `${(22 + rand() * 26).toFixed(1)}s`,
        delay: `${(-rand() * 30).toFixed(1)}s`,
        ax: rand().toFixed(2),
        ay: rand().toFixed(2),
        az: rand().toFixed(2),
      };
    });
  }, []);

  return (
    <div className="cubes-layer fx-parallax" aria-hidden="true">
      {cubes.map((c) => (
        <div
          key={c.key}
          className="fx-cube-wrap"
          style={
            {
              left: c.left,
              top: c.top,
              "--s": c.size,
              "--depth": c.depth,
              "--blur": c.blur,
              "--o": c.opacity,
              "--float": c.float,
              "--tumble": c.tumble,
              "--delay": c.delay,
              "--ax": c.ax,
              "--ay": c.ay,
              "--az": c.az,
            } as React.CSSProperties
          }
        >
          <div className="fx-cube">
            {FACES.map((f) => (
              <span key={f} className={`fx-face fx-face-${f}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const STAR_COUNT = 90;

/** Hyperspace: streaks fly out of the centre, and get a lot faster once a solve is actually running. */
function WarpBackground() {
  const stars = useMemo(() => {
    const rand = mulberry32(31337);
    return Array.from({ length: STAR_COUNT }, (_, i) => ({
      key: i,
      angle: `${(rand() * 360).toFixed(1)}deg`,
      dur: `${(2.6 + rand() * 4.4).toFixed(2)}s`,
      delay: `${(-rand() * 7).toFixed(2)}s`,
      len: (8 + rand() * 18).toFixed(1),
      from: `${(2 + rand() * 9).toFixed(1)}vmax`,
      hue: rand() < 0.55 ? "var(--accent)" : rand() < 0.5 ? "var(--cyan)" : "#ffffff",
    }));
  }, []);

  return (
    <div className="warp-layer" aria-hidden="true">
      <div className="warp-glow" />
      {stars.map((s) => (
        <span
          key={s.key}
          className="fx-star"
          style={{ "--a": s.angle, "--d": s.dur, "--dl": s.delay, "--len": s.len, "--from": s.from, "--c": s.hue } as React.CSSProperties}
        />
      ))}
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
    case "cubes":
      return <CubesBackground />;
    case "warp":
      return <WarpBackground />;
    case "minimal":
      return null;
  }
}
