"use client";

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TurnCube, type TurnState } from "@/components/lab/TurnCube";
import { FaceLetters } from "@/components/lab/FaceLetters";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import type { CubeQuality, CubeScene } from "@/lib/cube3d/scene";
import type { CubeJiggle } from "@/lib/cube3d/jiggle";
import type { CubeLook } from "@/lib/cube3d/look";
import { contextPool, type PoolClient } from "@/lib/cube3d/contextPool";

export type { CubeQuality };

type Quat = { x: number; y: number; z: number; w: number };

/**
 * The imperative side of the cube, for callers that move it every frame (the gyro): `setOrientation` draws the cube in that
 * pose on the next animation frame without going through React state; null goes back to the `orientation` prop.
 */
export interface Cube3DHandle {
  setOrientation(q: Quat | null): void;
}

/** Phones and tablets (touch, small screens) get the cheap tier; a desktop gets the middle tier. The scene steps itself down further if frames are slow. */
function defaultQuality(): CubeQuality {
  try {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.screen.width, window.screen.height) < 700;
    return touch || small ? "low" : "medium";
  } catch {
    return "low";
  }
}

export interface Cube3DProps {
  /** the cube BEFORE `turning` (54 facelets, U R F D L B) */
  facelets: string;
  /** a turn part-way through; `progress` is linear 0..1 and the cube eases it; `turnMs` (how long the turn takes on screen) sizes the motion blur */
  turning?: TurnState | null;
  /** square CSS size in px; omit to fill a box sized by `className` */
  size?: number;
  className?: string;
  /** gyro tilt: unit quaternion in the viewer frame (as ReplayGyroTwin / GyroTwin use) */
  orientation?: Quat | null;
  quality?: CubeQuality;
  /** per sticker (54, facelet order) a CSS colour that replaces its facelet colour, like TurnCube's `stickerFills`; undefined entries keep the facelet colour */
  stickerFills?: readonly (string | undefined)[];
  /** slight secondary motion (see lib/cube3d/jiggle): a wobble of the whole cube plus a tilt of the turning layer. Ignored under reduced motion and with effects off. */
  jiggle?: CubeJiggle | null;
  /** U/F/R... letters on the centre stickers */
  faceLetters?: boolean;
  /** degrees to the right of the cube's front the fixed camera sits (default 32); negative looks from the left */
  cameraYaw?: number;
  /** sticker style and body colour (Settings); changing it re-dresses the cube without rebuilding it */
  look?: CubeLook;
  /** "tight" (default) frames the cube close; "loose" leaves room for a cube spun to any grip (the gyro twin) */
  fit?: "tight" | "loose";
  /** whole-cube alpha 0..1, for a ghost cube (default 1; the cube only turns transparent below 1) */
  opacity?: number;
  /** the upcoming move ("R", "U'", "F2", "M"...): a curved arrow over the layer it turns; null hides it */
  nextMove?: string | null;
  /** facelet indices that glow, strength 0..1 (pieces lighting up as they are solved) */
  highlight?: { stickers: readonly number[]; strength: number } | null;
}

/** The twin's camera, for the CSS fallback. */
const fallbackCamera = (yaw: number) => `rotateX(-24deg) rotateY(${-yaw}deg)`;
const DEFAULT_YAW = 32;

function motionAllowed(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // no matchMedia
  }
  return document.documentElement.dataset.fxLevel !== "off";
}

/**
 * A glossy, studio-lit 3D cube (three.js, lazy-loaded): black plastic cubies, matte rounded stickers, a soft
 * contact shadow on a transparent canvas, a little motion blur on fast turns. Renders only when its props
 * change. Falls back to the CSS TurnCube when WebGL is unavailable, fails to start or its context is lost.
 */
export const Cube3D = memo(
  forwardRef<Cube3DHandle, Cube3DProps>(function Cube3D(
    { facelets, turning = null, size, className, orientation = null, quality, stickerFills, jiggle = null, faceLetters = false, cameraYaw = DEFAULT_YAW, look, fit: fitMode = "tight", opacity = 1, nextMove = null, highlight = null },
    handle,
  ) {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fallbackRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<CubeScene | null>(null);
    const visibleRef = useRef(false);
    // false until the first intersection report (a cube that starts off screen never builds a scene); without IntersectionObserver always on
    const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
    // bumped to give the cube a fresh canvas (a canvas whose context was released cannot get a new one) and re-acquire a context
    const [gen, setGen] = useState(0);
    const releasedRef = useRef(false);
    const rafRef = useRef(0);
    const latest = useRef({ facelets, turning, orientation, stickerFills, jiggle, faceLetters, look, opacity, nextMove, highlight });
    const poseRef = useRef<Quat | null>(null);
    const yawRef = useRef(cameraYaw);
    const [tier] = useState<CubeQuality>(() => quality ?? defaultQuality());
    const [mode, setMode] = useState<"loading" | "gl" | "fallback">("loading");
    const [px, setPx] = useState(size ?? 0);

    // Draw whatever the latest props are, at most once per animation frame.
    const schedule = useRef<() => void>(() => {});
    useEffect(() => {
      schedule.current = () => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const scene = sceneRef.current;
          if (!scene || !visibleRef.current) return;
          try {
            const s = latest.current;
            const motion = motionAllowed();
            scene.render({
              facelets: s.facelets,
              turning: s.turning,
              orientation: poseRef.current ?? s.orientation,
              motionBlur: motion,
              stickerFills: s.stickerFills,
              jiggle: motion ? s.jiggle : null,
              faceLetters: s.faceLetters,
              look: s.look,
              opacity: s.opacity,
              nextMove: s.nextMove,
              highlight: s.highlight,
            });
          } catch {
            setMode("fallback");
          }
        });
      };
    });

    // The CSS fallback's tilt, written straight to the DOM (the imperative pose never touches React).
    const writeFallbackPose = (q: Quat | null) => {
      const el = fallbackRef.current;
      if (el) el.style.transform = `${fallbackCamera(yawRef.current)} ${q ? cssMatrix3d(quatToMat(q)) : ""}`;
    };
    useImperativeHandle(
      handle,
      () => ({
        setOrientation(q) {
          poseRef.current = q;
          writeFallbackPose(q ?? latest.current.orientation);
          schedule.current();
        },
      }),
      [],
    );
    useEffect(() => {
      if (mode === "fallback") writeFallbackPose(poseRef.current ?? latest.current.orientation);
    }, [mode]);

    useEffect(() => {
      latest.current = { facelets, turning, orientation, stickerFills, jiggle, faceLetters, look, opacity, nextMove, highlight };
      schedule.current();
    }, [facelets, turning, orientation, stickerFills, jiggle, faceLetters, look, opacity, nextMove, highlight]);

    useEffect(() => {
      yawRef.current = cameraYaw;
      sceneRef.current?.setCameraYaw(cameraYaw);
      schedule.current();
    }, [cameraYaw]);

    // On screen or not. An off-screen cube lets go of its WebGL context (see lib/cube3d/contextPool) and builds a fresh scene when it is seen again.
    useEffect(() => {
      const box = boxRef.current;
      if (!box || typeof IntersectionObserver === "undefined") return;
      const io = new IntersectionObserver((entries) => {
        const on = entries[entries.length - 1]?.isIntersecting ?? true;
        visibleRef.current = on;
        if (on && releasedRef.current) {
          releasedRef.current = false;
          setGen((g) => g + 1);
        }
        setVisible(on);
        if (on) schedule.current();
      });
      io.observe(box);
      return () => io.disconnect();
    }, []);

    useEffect(() => {
      const box = boxRef.current;
      const canvas = canvasRef.current;
      if (!box || !canvas || !visible) return;
      let dead = false;
      let ro: ResizeObserver | null = null;
      let themeObserver: MutationObserver | null = null;
      const fit = () => {
        const scene = sceneRef.current;
        const r = box.getBoundingClientRect();
        setPx(Math.round(Math.min(r.width, r.height)));
        if (!scene || r.width < 1 || r.height < 1) return;
        scene.resize(r.width, r.height, window.devicePixelRatio || 1);
        schedule.current();
      };
      const onLost = (e: Event) => {
        e.preventDefault();
        setMode("fallback");
      };
      const onRestored = () => {
        sceneRef.current?.forceRestore();
        setMode("gl");
        schedule.current();
      };
      const client: PoolClient = {
        visible: () => visibleRef.current,
        evict: () => {
          // taken by a cube that is on screen: drop the scene now; this canvas is replaced when the cube is seen again
          releasedRef.current = true;
          sceneRef.current?.dispose();
          sceneRef.current = null;
        },
        retry: () => setGen((g) => g + 1),
      };
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      import("@/lib/cube3d/scene")
        .then(({ CubeScene: Scene }) => {
          if (dead) return;
          if (!contextPool.acquire(client)) {
            // every context is in use by a cube on screen: stay on the CSS cube until one frees up
            const r = box.getBoundingClientRect();
            setPx(Math.round(Math.min(r.width, r.height)));
            setMode("fallback");
            return;
          }
          const scene = new Scene(canvas, { quality: tier, cameraYaw: yawRef.current, fit: fitMode });
          sceneRef.current = scene;
          setMode("gl");
          fit();
          ro = new ResizeObserver(fit);
          ro.observe(box);
          // a theme change re-tints the studio light
          themeObserver = new MutationObserver(() => {
            sceneRef.current?.applyTheme();
            schedule.current();
          });
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        })
        .catch(() => {
          if (dead) return;
          contextPool.release(client);
          const r = box.getBoundingClientRect();
          setPx(Math.round(Math.min(r.width, r.height)));
          setMode("fallback");
        });
      return () => {
        dead = true;
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        ro?.disconnect();
        themeObserver?.disconnect();
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        if (sceneRef.current) releasedRef.current = true;
        sceneRef.current?.dispose();
        sceneRef.current = null;
        contextPool.release(client);
      };
    }, [tier, fitMode, visible, gen]);

    const fallbackSize = Math.max(24, Math.round(px * 0.5));
    return (
      <div ref={boxRef} className={className} style={size ? { width: size, height: size, position: "relative" } : { position: "relative" }} data-testid="cube3d" data-mode={mode}>
        <canvas key={gen} ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: mode === "fallback" ? "none" : "block" }} aria-hidden="true" />
        {mode === "fallback" && px > 0 && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", perspective: px * 3 }}>
            <div
              ref={fallbackRef}
              style={{ width: fallbackSize, height: fallbackSize, transformStyle: "preserve-3d", transform: `${fallbackCamera(cameraYaw)} ${orientation ? cssMatrix3d(quatToMat(orientation)) : ""}` }}
            >
              <TurnCube facelets={facelets} turning={turning} size={fallbackSize} stickerFills={stickerFills} />
              {faceLetters && fallbackSize >= 90 && <FaceLetters size={fallbackSize} />}
            </div>
          </div>
        )}
      </div>
    );
  }),
);
