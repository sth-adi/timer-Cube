"use client";

import { useEffect, useRef, useState } from "react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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

/** How far one arrow-key press or one degree of phone tilt rotates the view. */
const ORBIT_STEP_DEG = 12;
/** Keeps the camera shy of the poles, where cubing.js's own view becomes a flat, disorienting silhouette. */
const LATITUDE_LIMIT_DEG = 85;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitModel = any;

function clampLatitude(lat: number): number {
  return Math.max(-LATITUDE_LIMIT_DEG, Math.min(LATITUDE_LIMIT_DEG, lat));
}

/**
 * Nudges the player's camera by a relative amount, read-modify-write against
 * cubing.js's own live orbit state (`experimentalModel.twistySceneModel`) so
 * this always composes correctly with whatever the user's last drag, arrow
 * press, or tilt already did — there's no other way to read the current
 * camera back out, since the public `cameraLatitude`/`cameraLongitude`
 * setters are write-only.
 */
async function nudgeOrbit(model: OrbitModel, deltaLatitude: number, deltaLongitude: number): Promise<void> {
  const current = await model.orbitCoordinates.get();
  model.orbitCoordinatesRequest.set({
    latitude: clampLatitude(current.latitude + deltaLatitude),
    longitude: current.longitude + deltaLongitude,
    distance: current.distance,
  });
}

/**
 * Thin React wrapper around cubing.js's <twisty-player> web component for a
 * real animated 3D cube. Client-only (WebGL + custom element), so this must
 * be dynamically imported with ssr:false wherever it's used.
 */
export function CubeViewer({ alg, setupAlg, className, onReady }: CubeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroDenied, setGyroDenied] = useState(false);
  const gyroBaselineRef = useRef<{ beta: number; gamma: number; latitude: number; longitude: number } | null>(null);

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
      // The player's own drag-to-orbit handler calls preventDefault() on
      // every pointerdown regardless of direction, which — on a touchscreen
      // — cancels the browser's native scroll for that whole gesture, not
      // just the drag. Restricting the element to vertical panning means a
      // mostly-vertical touch starting on the cube scrolls the page (or
      // whatever scrollable ancestor it's in) like normal, while a
      // mostly-horizontal drag still reaches the player to orbit the camera
      // — arrow keys and tilt-to-rotate (below) still cover full orbit
      // control either way, so nothing is lost outright.
      player.style.touchAction = "pan-y";
      container.appendChild(player);
      playerRef.current = player;
      setPlayerReady(true);
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
      setPlayerReady(false);
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

  // Tilt-to-rotate: while enabled, the view tracks the phone's tilt relative
  // to however it was held the moment gyro was turned on (not absolute
  // compass/tilt angles, which would make the starting view depend on
  // however you happened to be holding the phone) — so tilting right/left
  // and toward/away from you orbits the camera the same way a drag would.
  useEffect(() => {
    if (!gyroOn) return;
    const model = playerRef.current?.experimentalModel?.twistySceneModel;
    if (!model) return;
    gyroBaselineRef.current = null;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const beta = e.beta;
      const gamma = e.gamma;
      void (async () => {
        if (!gyroBaselineRef.current) {
          const current = await model.orbitCoordinates.get();
          gyroBaselineRef.current = { beta, gamma, latitude: current.latitude, longitude: current.longitude };
          return;
        }
        const base = gyroBaselineRef.current;
        const current = await model.orbitCoordinates.get();
        model.orbitCoordinatesRequest.set({
          latitude: clampLatitude(base.latitude + (beta - base.beta)),
          longitude: base.longitude - (gamma - base.gamma),
          distance: current.distance,
        });
      })();
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      gyroBaselineRef.current = null;
    };
  }, [gyroOn]);

  const onToggleGyro = async () => {
    if (gyroOn) {
      setGyroOn(false);
      return;
    }
    setGyroDenied(false);
    const ctor = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null;
    const requestPermission = (ctor as unknown as { requestPermission?: () => Promise<"granted" | "denied"> } | null)
      ?.requestPermission;
    if (typeof requestPermission === "function") {
      try {
        // Must be called synchronously-ish from a user gesture (this click
        // handler) — iOS Safari refuses it otherwise. Only iOS exposes this
        // gate at all; everywhere else the browser just starts firing events.
        const result = await requestPermission();
        if (result !== "granted") {
          setGyroDenied(true);
          return;
        }
      } catch {
        setGyroDenied(true);
        return;
      }
    }
    setGyroOn(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const model = playerRef.current?.experimentalModel?.twistySceneModel;
    if (!model) return;
    // Mirrors drag's own sign convention (see TwistyOrbitControls.onMovement
    // in cubing/twisty) so an arrow key rotates the view the same way
    // dragging in that direction would, rather than introducing a second,
    // inconsistent convention.
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        void nudgeOrbit(model, -ORBIT_STEP_DEG, 0);
        return;
      case "ArrowDown":
        e.preventDefault();
        void nudgeOrbit(model, ORBIT_STEP_DEG, 0);
        return;
      case "ArrowLeft":
        e.preventDefault();
        void nudgeOrbit(model, 0, ORBIT_STEP_DEG);
        return;
      case "ArrowRight":
        e.preventDefault();
        void nudgeOrbit(model, 0, -ORBIT_STEP_DEG);
        return;
    }
  };

  const gyroSupported = typeof window !== "undefined" && "DeviceOrientationEvent" in window;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={cn(className, "outline-none focus-visible:ring-2 focus-visible:ring-accent")}
        style={{ overflow: "hidden" }}
        tabIndex={0}
        role="group"
        aria-label="3D cube view — use arrow keys to rotate"
        onKeyDown={onKeyDown}
      />
      {playerReady && gyroSupported && (
        <button
          type="button"
          onClick={() => void onToggleGyro()}
          aria-pressed={gyroOn}
          aria-label={gyroOn ? "Turn off tilt-to-rotate" : "Turn on tilt-to-rotate"}
          title={gyroDenied ? "Motion access denied — check your browser's site permissions" : "Tilt phone to rotate"}
          className={cn(
            "absolute bottom-1.5 right-1.5 flex items-center justify-center rounded-full p-1.5 transition-colors",
            gyroOn ? "bg-accent text-accent-fg" : "bg-bg-panel-2/80 text-muted hover:text-foreground",
          )}
        >
          <Compass size={13} />
        </button>
      )}
    </div>
  );
}
