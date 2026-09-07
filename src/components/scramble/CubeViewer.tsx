"use client";

import { useEffect, useRef } from "react";

interface CubeViewerProps {
  /** The alg that actually plays/scrubs in the player's timeline. */
  alg: string;
  /**
   * Moves applied silently to establish the starting position before `alg`
   * plays — e.g. the scramble, so the player opens already scrambled and
   * only the solution itself animates, instead of animating the scramble
   * first and the solution second.
   */
  setupAlg?: string;
  className?: string;
  controlPanel?: "none" | "bottom-row";
}

/**
 * Thin React wrapper around cubing.js's <twisty-player> web component for a
 * real animated 3D cube. Client-only (WebGL + custom element), so this must
 * be dynamically imported with ssr:false wherever it's used.
 */
export function CubeViewer({ alg, setupAlg, className, controlPanel = "none" }: CubeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    (async () => {
      const { TwistyPlayer } = await import("cubing/twisty");
      if (cancelled || !container) return;
      const player = new TwistyPlayer({
        puzzle: "3x3x3",
        alg,
        experimentalSetupAlg: setupAlg,
        background: "none",
        controlPanel,
        hintFacelets: "none",
        experimentalDragInput: "auto",
      });
      player.style.width = "100%";
      player.style.height = "100%";
      container.appendChild(player);
      playerRef.current = player;
    })();
    return () => {
      cancelled = true;
      if (playerRef.current && container?.contains(playerRef.current)) {
        container.removeChild(playerRef.current);
      }
      playerRef.current = null;
    };
    // Only (re)create the player on mount/unmount; alg/setupAlg updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Set together (setup before alg) so there's never an intermediate
    // frame where one updated but not the other.
    if (!playerRef.current) return;
    playerRef.current.experimentalSetupAlg = setupAlg ?? "";
    playerRef.current.alg = alg;
  }, [alg, setupAlg]);

  return <div ref={containerRef} className={className} />;
}
