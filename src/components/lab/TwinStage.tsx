"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "@/styles/twin.css";
import { shadowTransform } from "./groundShadow";

/**
 * The box a Gyro Twin floats in: a flat contact shadow (a dark, low-opacity ellipse squashed to ~15% height, just
 * under the cube) plus the perspective stage the tilted cube sits in. The shadow follows the cube's tilt: it
 * shifts toward the cube's lowest face and widens as the cube turns corner-first (see groundShadow.ts), read from
 * the cube element's own transform whenever that changes, so the callers that tilt the cube need do nothing.
 * `box` is the square's side as a multiple of the cube's size; `drop` is how far below the centre the shadow
 * sits, also in cube sizes.
 */
export function TwinStage({ size, box = 1.9, drop = 0.84, children }: { size: number; box?: number; drop?: number; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cube = stageRef.current?.firstElementChild;
    const shadow = shadowRef.current;
    if (!shadow || !(cube instanceof HTMLElement) || typeof MutationObserver === "undefined") return;
    let last: string | null = null;
    const follow = () => {
      const t = cube.style.transform;
      if (t === last) return;
      last = t;
      shadow.style.transform = shadowTransform(t, size);
    };
    follow();
    // Fires only when the cube's style is written (a gyro sample's frame, a replay's lean), never on a timer of its own.
    const observer = new MutationObserver(follow);
    observer.observe(cube, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [size]);

  return (
    <div className="twin-wrap" style={{ width: size * box, height: size * box, ["--tw-s" as string]: `${size}px` }}>
      <span
        ref={shadowRef}
        aria-hidden="true"
        className="twin-shadow"
        style={{ width: size * 1.2, height: size * 0.15, marginLeft: size * -0.6, top: `calc(50% + ${(size * (drop - 0.075)).toFixed(1)}px)` }}
      />
      <div ref={stageRef} className="twin-stage" data-compact={size < 70 ? "true" : undefined} style={{ perspective: size * 5.2 }}>
        {children}
      </div>
    </div>
  );
}
