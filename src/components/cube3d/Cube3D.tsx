"use client";

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TurnCube, type TurnState } from "@/components/lab/TurnCube";
import { FaceLetters } from "@/components/lab/FaceLetters";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import type { CubeQuality, CubeScene } from "@/lib/cube3d/scene";
import type { CubeJiggle } from "@/lib/cube3d/jiggle";

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
  /** a turn part-way through; `progress` is linear 0..1 and the cube eases it */
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
    { facelets, turning = null, size, className, orientation = null, quality, stickerFills, jiggle = null, faceLetters = false, cameraYaw = DEFAULT_YAW },
    handle,
  ) {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fallbackRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<CubeScene | null>(null);
    const visibleRef = useRef(true);
    const rafRef = useRef(0);
    const latest = useRef({ facelets, turning, orientation, stickerFills, jiggle, faceLetters });
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
      latest.current = { facelets, turning, orientation, stickerFills, jiggle, faceLetters };
      schedule.current();
    }, [facelets, turning, orientation, stickerFills, jiggle, faceLetters]);

    useEffect(() => {
      yawRef.current = cameraYaw;
      sceneRef.current?.setCameraYaw(cameraYaw);
      schedule.current();
    }, [cameraYaw]);

    useEffect(() => {
      const box = boxRef.current;
      const canvas = canvasRef.current;
      if (!box || !canvas) return;
      let dead = false;
      let ro: ResizeObserver | null = null;
      let io: IntersectionObserver | null = null;
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
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      import("@/lib/cube3d/scene")
        .then(({ CubeScene: Scene }) => {
          if (dead) return;
          const scene = new Scene(canvas, { quality: tier, cameraYaw: yawRef.current });
          sceneRef.current = scene;
          setMode("gl");
          fit();
          ro = new ResizeObserver(fit);
          ro.observe(box);
          io = new IntersectionObserver((entries) => {
            visibleRef.current = entries[entries.length - 1]?.isIntersecting ?? true;
            if (visibleRef.current) schedule.current();
          });
          io.observe(box);
        })
        .catch(() => {
          if (dead) return;
          const r = box.getBoundingClientRect();
          setPx(Math.round(Math.min(r.width, r.height)));
          setMode("fallback");
        });
      return () => {
        dead = true;
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        ro?.disconnect();
        io?.disconnect();
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        sceneRef.current?.dispose();
        sceneRef.current = null;
      };
    }, [tier]);

    const fallbackSize = Math.max(24, Math.round(px * 0.5));
    return (
      <div ref={boxRef} className={className} style={size ? { width: size, height: size, position: "relative" } : { position: "relative" }} data-testid="cube3d" data-mode={mode}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: mode === "fallback" ? "none" : "block" }} aria-hidden="true" />
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
