"use client";

import { useCallback, useEffect, useRef } from "react";
import { createCubeSounds, type CubeSounds, type PlayTurnArgs } from "@/lib/audio/cubeSounds";
import { newAudioContext } from "@/lib/reel/soundtrack";
import { useSettingsStore } from "@/lib/store/settingsStore";

// One context and engine for the whole page, created on first need.
let ctx: AudioContext | null = null;
let engine: CubeSounds | null = null;

function ensureEngine(): CubeSounds | null {
  if (!engine) {
    ctx = newAudioContext();
    if (!ctx) return null;
    engine = createCubeSounds(ctx);
    void engine.loadSamples();
  }
  if (ctx && ctx.state !== "running") {
    try {
      void ctx.resume().catch(() => {});
    } catch {
      // Stays silent until a gesture allows it.
    }
  }
  return engine;
}

function isEnabled(force = false): boolean {
  const s = useSettingsStore.getState();
  return s.cubeSoundsEnabled && (force || s.soundEnabled);
}

/**
 * Speedcube sounds for the replay (and later the live twin). Silent unless both
 * the global sound setting and the "Cube sounds" setting are on. Reduced motion
 * does not mute it: sound is not motion. The audio context is created lazily
 * and woken by the first pointer or key press, as browsers require.
 *
 * `force`: the caller has its own sound toggle and it is on (the replay's speaker button), which stands in for
 * the global "Sound on solve" setting; the "Cube sounds" setting still has the last word.
 */
export function useCubeSounds({ force = false }: { force?: boolean } = {}) {
  const forceRef = useRef(force);
  useEffect(() => {
    forceRef.current = force;
  }, [force]);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const cubeSoundsEnabled = useSettingsStore((s) => s.cubeSoundsEnabled);
  const enabled = cubeSoundsEnabled && (force || soundEnabled);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      ensureEngine();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  const playTurn = useCallback((args: PlayTurnArgs) => {
    if (isEnabled(forceRef.current)) ensureEngine()?.playTurn(args);
  }, []);
  const playStart = useCallback(() => {
    if (isEnabled(forceRef.current)) ensureEngine()?.playStart();
  }, []);
  const playStop = useCallback(() => {
    if (isEnabled(forceRef.current)) ensureEngine()?.playStop();
  }, []);
  /** Call from a click/tap handler to create and wake the context early. */
  const unlock = useCallback((force?: boolean) => {
    if (isEnabled(force ?? forceRef.current)) ensureEngine();
  }, []);

  return { enabled, playTurn, playStart, playStop, unlock };
}
