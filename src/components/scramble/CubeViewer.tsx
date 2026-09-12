"use client";

import { useEffect, useRef } from "react";

export interface CubeViewerHandle {
  play(): void;
  togglePlay(): void;
  jumpToStart(): void;
  /** Subscribes to play/pause state; returns an unsubscribe function. */
  onPlayingChange(cb: (playing: boolean) => void): () => void;
}

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
  /**
   * Called once the player exists, with a handle for driving playback from
   * outside (see the CAMERA_LATITUDE doc comment below for why this can't
   * just be cubing.js's own built-in control row). Not a ref: this component
   * is always loaded through `next/dynamic({ ssr: false })`, and refs aren't
   * reliably forwarded through that lazy-loading boundary, while a plain
   * callback prop is.
   */
  onReady?: (handle: CubeViewerHandle) => void;
}

/**
 * Every 3D view in the app opens with yellow (D) on top instead of
 * cubing.js's default white (U) on top, matching how a solver actually
 * holds the cube — cross+F2L on the bottom, OLL/PLL practiced on top.
 *
 * This can't be done by baking a whole-cube rotation into
 * `experimentalSetupAlg` (an earlier version of this file did exactly that,
 * prepending "x2") — that reinterprets every U/D/F/B move that comes after
 * it in the sequence, which silently corrupts any setup longer than a
 * couple of moves (a real scramble, or a solver-computed cross+F2L+OLL
 * setup, uses those letters constantly).
 *
 * It also can't be done with the camera alone: cubing.js's `cameraLatitude`
 * keeps the camera's "up" locked to world +Y (see `setCameraFromOrbitCoordinates`
 * in cubing/twisty), so whichever pole is physically higher always renders
 * toward the top of the frame regardless of which side of the cube the
 * camera is on — U (white) stays visually "up" even when viewed from
 * below. Getting yellow to actually render at the top needs a camera on
 * the *opposite* pole (negative latitude — same magnitude as cubing.js's
 * own default of +35, so the framing is otherwise identical) plus an
 * in-plane 180° flip to correct the resulting upside-down composition.
 * A 180° rotation is a pure roll around the viewing axis, not a mirror, so
 * it doesn't affect the cube's chirality — turns still look correct.
 *
 * That 180° flip is applied to the `<twisty-player>` element itself, so a
 * consumer that wants play/scrub controls can't use cubing.js's own built-in
 * control row (`controlPanel: "bottom-row"`) — it lives inside the same
 * element and would flip upside down with it, with its buttons' left-right
 * order reversed too. Consumers that need controls drive them externally
 * via `onReady` instead (see CaseDetailSheet).
 */
export const CAMERA_LATITUDE = -35;
export const CAMERA_LONGITUDE = 30;

/**
 * Thin React wrapper around cubing.js's <twisty-player> web component for a
 * real animated 3D cube. Client-only (WebGL + custom element), so this must
 * be dynamically imported with ssr:false wherever it's used.
 */
export function CubeViewer({ alg, setupAlg, className, onReady }: CubeViewerProps) {
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
        controlPanel: "none",
        hintFacelets: "none",
        experimentalDragInput: "auto",
        cameraLatitude: CAMERA_LATITUDE,
        cameraLongitude: CAMERA_LONGITUDE,
      });
      player.style.width = "100%";
      player.style.height = "100%";
      player.style.transform = "rotate(180deg)";
      container.appendChild(player);
      playerRef.current = player;
      onReady?.({
        play: () => playerRef.current?.play(),
        togglePlay: () => playerRef.current?.togglePlay(),
        jumpToStart: () => playerRef.current?.jumpToStart(),
        onPlayingChange: (cb: (playing: boolean) => void) => {
          const playingInfo = playerRef.current?.experimentalModel?.playingInfo;
          if (!playingInfo) return () => {};
          const listener = (info: { playing: boolean }) => cb(info.playing);
          playingInfo.addFreshListener(listener);
          return () => playingInfo.removeFreshListener?.(listener);
        },
      });
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

  return <div ref={containerRef} className={className} style={{ overflow: "hidden" }} />;
}
