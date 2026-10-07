"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import "@/styles/twin.css";
import { recolorPlayer } from "./cubeColors";
import { planLiveUpdate, tempoScaleFor } from "./liveTurns";

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
  /**
   * Opt-in "live" mode, for mirroring a cube turn by turn (see LiveCubeMimic).
   * When given, the position shown is `setupAlg` followed by these moves and
   * `alg` is ignored (pass ""). Each time moves are only appended, the earlier
   * ones are folded into the setup incrementally (no re-parse of the whole
   * list) and just the newest turn plays, over `liveTurnMs`; anything else —
   * a reset, a correction, a rewind, a new scramble — rebuilds the position
   * instantly. Honours prefers-reduced-motion by snapping, and snaps when
   * turns arrive faster than they can animate. Leave undefined for the
   * original behaviour.
   */
  liveMoves?: readonly string[];
  /** How long one quarter turn takes to play in live mode (default 80ms). */
  liveTurnMs?: number;
  /**
   * Shown in the viewer's box while cubing.js is still loading and, with a short note, if it fails to
   * load (offline, a blocked chunk, no WebGL). Without it the box is empty while loading, and a
   * failed load shows just the note. See LiveCubeMimic, which passes a flat net of the cube.
   */
  fallback?: ReactNode;
}

/**
 * cubing.js is the heavy part of the 3D view, and every first use waits on it.
 * One shared promise, so a preload (see preloadCubeViewer in LiveCubeMimic)
 * and the player's own mount hit the same download.
 */
let cubingLoad: Promise<{ twisty: typeof import("cubing/twisty"); alg: typeof import("cubing/alg") }> | null = null;
export function loadCubing() {
  if (!cubingLoad) {
    cubingLoad = Promise.all([import("cubing/twisty"), import("cubing/alg")]).then(([twisty, alg]) => ({ twisty, alg }));
    // A failed download must not poison later attempts.
    cubingLoad.catch(() => {
      cubingLoad = null;
    });
  }
  return cubingLoad;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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
export function CubeViewer({ alg, setupAlg, className, onReady, liveMoves, liveTurnMs = 80, fallback }: CubeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  // The download (or the player itself) failed: say so quietly instead of leaving an empty box and an unhandled rejection. `loadAttempt` re-runs the load from the Retry button.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroDenied, setGyroDenied] = useState(false);
  const gyroBaselineRef = useRef<{ beta: number; gamma: number; latitude: number; longitude: number } | null>(null);
  const algCtorRef = useRef<(typeof import("cubing/alg"))["Alg"] | null>(null);
  // What live mode has put into the player: the snapshot the planner compares
  // against, the setup as an Alg object (extended per move, never re-parsed),
  // and when the last turn started animating.
  const liveRef = useRef<{ setup: string; tokens: readonly string[]; baked: InstanceType<(typeof import("cubing/alg"))["Alg"]>; lastAnimMs: number } | null>(null);
  const isLive = liveMoves !== undefined;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    (async () => {
      let player: InstanceType<(typeof import("cubing/twisty"))["TwistyPlayer"]>;
      let algModule: typeof import("cubing/alg");
      try {
        const loaded = await loadCubing();
        algModule = loaded.alg;
        if (cancelled || !container) return;
        player = new loaded.twisty.TwistyPlayer({
          puzzle: "3x3x3",
          alg,
          experimentalSetupAlg: setupAlg,
          background: "none",
          controlPanel: "none",
          hintFacelets: "none",
          experimentalDragInput: "auto",
          cameraLatitude: CAMERA_LATITUDE,
          cameraLongitude: CAMERA_LONGITUDE,
          ...(isLive ? { tempoScale: tempoScaleFor(liveTurnMs) } : {}),
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
        return;
      }
      algCtorRef.current = algModule.Alg;
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
      // Same sticker colours as the twin and the nets (cubing.js paints its own, more saturated ones).
      void recolorPlayer(player);
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
      liveRef.current = null;
      setPlayerReady(false);
    };
    // Only (re)create the player on mount/unmount (or a Retry); alg/setupAlg updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  useEffect(() => {
    // Set together (setup before alg) so there's never an intermediate
    // frame where one updated but not the other.
    if (isLive || !playerRef.current) return;
    playerRef.current.experimentalSetupAlg = setupAlg ?? "";
    playerRef.current.alg = alg;
  }, [alg, setupAlg, isLive]);

  // Live mode (opt-in, see `liveMoves`). The player always holds "every move
  // but the newest" as its setup and the newest turn as its alg, so one turn
  // visibly rotates instead of the whole position jumping. Depends on
  // playerReady so moves that arrive while cubing.js is still loading are
  // shown the moment the player exists.
  useEffect(() => {
    const player = playerRef.current;
    const AlgCtor = algCtorRef.current;
    if (!liveMoves || !player || !AlgCtor || !playerReady) return;
    const setup = setupAlg ?? "";
    const prev = liveRef.current;
    const nowMs = performance.now();
    const plan = planLiveUpdate(prev ? { setup: prev.setup, tokens: prev.tokens } : null, { setup, tokens: liveMoves }, {
      nowMs,
      lastAnimMs: prev?.lastAnimMs ?? -Infinity,
      reducedMotion: prefersReducedMotion(),
    });
    if (plan.kind === "none") return;
    const tempo = tempoScaleFor(liveTurnMs);
    try {
      if (plan.kind === "append" && prev) {
        if (plan.animate) {
          const last = plan.added[plan.added.length - 1];
          const silent = plan.added.slice(0, -1);
          const before = silent.length ? prev.baked.concat(silent.join(" ")) : prev.baked;
          // Stops any turn still playing (it is folded into `before`) and rewinds the clock.
          player.jumpToStart({ flash: false });
          player.tempoScale = tempo;
          player.experimentalSetupAlg = before;
          player.alg = last;
          player.play();
          liveRef.current = { setup, tokens: liveMoves, baked: before.concat(last), lastAnimMs: nowMs };
        } else {
          const baked = prev.baked.concat(plan.added.join(" "));
          player.pause();
          player.experimentalSetupAlg = baked;
          player.alg = "";
          liveRef.current = { setup, tokens: liveMoves, baked, lastAnimMs: prev.lastAnimMs };
        }
        return;
      }
      // First show, or the moves were not simply appended: rebuild everything.
      const baked = AlgCtor.fromString([setup, ...liveMoves].filter(Boolean).join(" "));
      player.pause();
      player.tempoScale = tempo;
      player.experimentalSetupAlg = baked;
      player.alg = "";
      liveRef.current = { setup, tokens: liveMoves, baked, lastAnimMs: -Infinity };
    } catch {
      // A token cubing.js can't parse: leave the last good position showing
      // and re-plan from scratch on the next change.
      liveRef.current = null;
    }
  }, [liveMoves, setupAlg, liveTurnMs, playerReady]);

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
      {/* The same soft ground shadow the Gyro Twin floats over, sized from the box so it sits under the cube at any aspect. */}
      <div className="cv-floor" aria-hidden="true">
        <span className="cv-ground" />
      </div>
      <div
        ref={containerRef}
        className={cn(className, "cv-stage outline-none focus-visible:ring-2 focus-visible:ring-accent")}
        data-ready={playerReady ? "true" : "false"}
        style={{ overflow: "hidden" }}
        tabIndex={0}
        role="group"
        aria-label="3D cube view, use arrow keys to rotate"
        onKeyDown={onKeyDown}
      />
      {(fallback || (loadFailed && !playerReady)) && (
        // Stays mounted and fades out once the player is up, so the flat net hands over to the 3D cube without a blink.
        <div
          className="cv-fallback pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 p-2"
          data-testid="cube-viewer-fallback"
          data-ready={playerReady ? "true" : "false"}
          aria-hidden={playerReady ? true : undefined}
        >
          {fallback}
          {loadFailed && (
            <p className="pointer-events-auto text-center text-[11px] text-muted" role="status">
              3D view unavailable.{" "}
              <button
                type="button"
                onClick={() => {
                  setLoadFailed(false);
                  setLoadAttempt((n) => n + 1);
                }}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                Retry
              </button>
            </p>
          )}
        </div>
      )}
      {playerReady && gyroSupported && (
        <button
          type="button"
          onClick={() => void onToggleGyro()}
          aria-pressed={gyroOn}
          aria-label={gyroOn ? "Turn off tilt-to-rotate" : "Turn on tilt-to-rotate"}
          title={gyroDenied ? "Motion access denied, check your browser's site permissions" : "Tilt phone to rotate"}
          className={cn(
            "hit absolute bottom-1.5 right-1.5 flex items-center justify-center rounded-full p-1.5 transition-colors",
            gyroOn ? "bg-accent text-accent-fg" : "bg-bg-panel-2/80 text-muted hover:text-foreground",
          )}
        >
          <Compass size={13} />
        </button>
      )}
    </div>
  );
}
