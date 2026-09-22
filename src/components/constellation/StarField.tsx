"use client";

import { useCallback, useRef } from "react";
import type { ConstellationStar } from "@/lib/stats/constellation";
import { formatTime } from "@/lib/utils/time";

/** Half-extent (px) of the cube of space stars are placed within — how "big" the galaxy feels. */
const RANGE = 220;
/** Drag distance (px) beyond which a pointer gesture counts as an orbit drag, not a tap — so spinning the field never accidentally opens a star. */
const DRAG_THRESHOLD = 6;
/** Starting orbit angles (degrees) — a three-quarter view that reads as "3D" immediately, before anyone's dragged anything. */
const INITIAL_ROTATION = { x: -18, y: 25 };

interface StarFieldProps {
  stars: ConstellationStar[];
  onSelect: (star: ConstellationStar) => void;
}

/**
 * A real, explorable 3D star field built the same way this app's isometric
 * cube icons are (CSS 3D transforms — see CubeLookaheadIcon), not a canvas or
 * WebGL scene: a `perspective` wrapper around a `preserve-3d` world div,
 * with each star placed via `translate3d` and the whole world rotated by
 * drag. No new rendering dependency, and it composes with the rest of the
 * app's theming (stars pick up `var(--accent)`) the way a WebGL canvas
 * couldn't without its own color-management layer.
 *
 * Rotation is written straight to the DOM via a ref rather than React state,
 * the same bypass-reconciliation trick `performanceAuraBus` uses for
 * per-frame updates — a drag gesture can fire many pointermove events a
 * second, and re-rendering every star's props that often would be wasted
 * work when only one CSS transform on one wrapper element actually changes.
 */
export function StarField({ stars, onSelect }: StarFieldProps) {
  const worldRef = useRef<HTMLDivElement | null>(null);
  const rotation = useRef({ ...INITIAL_ROTATION });
  const drag = useRef<{ startX: number; startY: number; startRotX: number; startRotY: number; moved: number } | null>(null);

  const applyRotation = useCallback(() => {
    const el = worldRef.current;
    if (el) el.style.transform = `rotateX(${rotation.current.x}deg) rotateY(${rotation.current.y}deg)`;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startY: e.clientY, startRotX: rotation.current.x, startRotY: rotation.current.y, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      d.moved = Math.max(d.moved, Math.hypot(dx, dy));
      rotation.current = {
        x: Math.max(-85, Math.min(85, d.startRotX - dy * 0.4)),
        y: d.startRotY + dx * 0.4,
      };
      applyRotation();
    },
    [applyRotation],
  );

  // A star's own onClick never fires for a pointer/touch tap: setPointerCapture
  // above retargets every subsequent event for that pointer — including
  // `.target` itself, not just which element's listeners run — to this
  // wrapper, a well-known pointer-capture gotcha. `document.elementFromPoint`
  // does a real, capture-independent hit test at the release coordinates, so
  // the tap is resolved here instead, via the `data-star-id` each star
  // carries. The button's own onClick stays wired up too, since keyboard
  // activation (Enter/Space on a focused star) dispatches a real click with
  // no pointer capture involved at all.
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.moved > DRAG_THRESHOLD) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const starEl = hit?.closest<HTMLElement>("[data-star-id]");
      if (!starEl) return;
      const star = stars.find((s) => s.solve.id === starEl.dataset.starId);
      if (star) onSelect(star);
    },
    [stars, onSelect],
  );

  const handleStarClick = useCallback(
    (star: ConstellationStar) => {
      if ((drag.current?.moved ?? 0) > DRAG_THRESHOLD) return;
      onSelect(star);
    },
    [onSelect],
  );

  return (
    <div
      className="relative h-full w-full touch-none select-none"
      style={{ perspective: 900 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={worldRef}
        className="absolute left-1/2 top-1/2"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${INITIAL_ROTATION.x}deg) rotateY(${INITIAL_ROTATION.y}deg)`,
        }}
      >
        {stars.map((star) => {
          const size = star.isPB ? 15 : 5 + (star.z + 1) * 2.5;
          const color = star.isPB ? "#ffd42a" : "var(--accent)";
          return (
            <button
              key={star.solve.id}
              type="button"
              data-star-id={star.solve.id}
              onClick={() => handleStarClick(star)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 hover:scale-150 focus-visible:scale-150"
              style={{
                width: size,
                height: size,
                background: color,
                boxShadow: star.isPB ? `0 0 14px 5px ${color}` : `0 0 6px 1.5px ${color}`,
                transform: `translate3d(${star.x * RANGE}px, ${-star.y * RANGE}px, ${star.z * RANGE}px)`,
              }}
              aria-label={`Solve ${formatTime(star.finalMs)}${star.isPB ? " (PB at the time)" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
