import type { ReactNode } from "react";
import "@/styles/twin.css";

/**
 * The box a Gyro Twin floats in: a soft ground shadow (an ellipse squashed to ~15% height, just under the
 * cube) plus the perspective stage the tilted cube sits in. The stage is a flat element, so it can carry
 * the cube's drop shadow and faint accent glow (see styles/twin.css) without flattening the 3D scene.
 * `box` is the square's side as a multiple of the cube's size; `drop` is how far below the centre the
 * shadow sits, also in cube sizes. Under data-fx-level="off" only the ground shadow remains.
 */
export function TwinStage({ size, box = 1.9, drop = 0.84, children }: { size: number; box?: number; drop?: number; children: ReactNode }) {
  return (
    <div className="twin-wrap" style={{ width: size * box, height: size * box }}>
      <span
        aria-hidden="true"
        className="twin-shadow"
        style={{ width: size * 1.2, height: size * 0.15, marginLeft: size * -0.6, top: `calc(50% + ${(size * (drop - 0.075)).toFixed(1)}px)` }}
      />
      <div className="twin-stage" data-compact={size < 70 ? "true" : undefined} style={{ perspective: size * 7 }}>
        {children}
      </div>
    </div>
  );
}
