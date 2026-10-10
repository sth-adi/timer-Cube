"use client";

import { memo, useEffect, useRef, useState } from "react";
import { TurnCube, type TurnState } from "@/components/lab/TurnCube";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import type { CubeQuality, CubeScene } from "@/lib/cube3d/scene";

export type { CubeQuality };

export interface Cube3DProps {
  /** the cube BEFORE `turning` (54 facelets, U R F D L B) */
  facelets: string;
  /** a turn part-way through; `progress` is linear 0..1 and the cube eases it */
  turning?: TurnState | null;
  /** square CSS size in px; omit to fill a box sized by `className` */
  size?: number;
  className?: string;
  /** gyro tilt: unit quaternion in the viewer frame (as ReplayGyroTwin / GyroTwin use) */
  orientation?: { x: number; y: number; z: number; w: number } | null;
  quality?: CubeQuality;
}

/** The twin's camera, for the CSS fallback. */
const FALLBACK_CAMERA = "rotateX(-24deg) rotateY(-32deg)";

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
export const Cube3D = memo(function Cube3D({ facelets, turning = null, size, className, orientation = null, quality = "high" }: Cube3DProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const visibleRef = useRef(true);
  const rafRef = useRef(0);
  const latest = useRef({ facelets, turning, orientation });
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
          scene.render({ facelets: s.facelets, turning: s.turning, orientation: s.orientation, motionBlur: motionAllowed() });
        } catch {
          setMode("fallback");
        }
      });
    };
  });

  useEffect(() => {
    latest.current = { facelets, turning, orientation };
    schedule.current();
  }, [facelets, turning, orientation]);

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
        const scene = new Scene(canvas, { quality });
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
  }, [quality]);

  const fallbackSize = Math.max(24, Math.round(px * 0.5));
  return (
    <div ref={boxRef} className={className} style={size ? { width: size, height: size, position: "relative" } : { position: "relative" }} data-testid="cube3d" data-mode={mode}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: mode === "fallback" ? "none" : "block" }} aria-hidden="true" />
      {mode === "fallback" && px > 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", perspective: px * 3 }}>
          <div style={{ width: fallbackSize, height: fallbackSize, transformStyle: "preserve-3d", transform: `${FALLBACK_CAMERA} ${orientation ? cssMatrix3d(quatToMat(orientation)) : ""}` }}>
            <TurnCube facelets={facelets} turning={turning} size={fallbackSize} />
          </div>
        </div>
      )}
    </div>
  );
});
