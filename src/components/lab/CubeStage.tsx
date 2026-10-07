"use client";

import type { ReactNode } from "react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { cn } from "@/lib/utils/cn";
import "@/styles/cubestage.css";

export type CubeStageState = "loading" | "ready" | "failed";

/**
 * The stage a big 3D cube stands on: a flat contact shadow under it (the same recipe as the Gyro Twin: a plain
 * dark low-opacity shape, no glow and no blur; see styles/cubestage.css). The caller
 * sizes it with `className` (it reserves its box, so nothing jumps when the cube arrives) and puts the
 * cube's own element in `children`, wrapped in a `.cube-stage__cube` element.
 *
 * While `state` is "loading" or "failed" a quiet CSS-drawn cube stands in for it, so the box is never an
 * empty hole — "failed" adds a short note and a Retry (cubing.js can fail to load offline or without WebGL).
 */
export function CubeStage({
  className,
  state = "ready",
  onRetry,
  children,
}: {
  className?: string;
  state?: CubeStageState;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={cn("cube-stage", className)} data-state={state} data-testid="cube-stage">
      {children}
      {state !== "ready" && (
        <div className="cube-stage__fallback">
          <StageCubeIcon />
          {state === "failed" && (
            <p className="pointer-events-auto text-center text-[11px] text-muted" role="status">
              3D view unavailable.
              {onRetry && (
                <>
                  {" "}
                  <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:text-foreground">
                    Retry
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// An isometric cube, three faces of 3x3 stickers, in the app's sticker colors (yellow up, green front-left, red front-right).
const K = 20;
const C30 = 0.866;
type Pt = readonly [number, number];

function faceCells(origin: Pt, u: Pt, v: Pt, color: string): { points: string; color: string }[] {
  const g = 0.07;
  const at = (i: number, j: number): string => `${(origin[0] + (u[0] * i + v[0] * j) * K).toFixed(2)},${(origin[1] + (u[1] * i + v[1] * j) * K).toFixed(2)}`;
  const cells: { points: string; color: string }[] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      cells.push({ points: [at(i + g, j + g), at(i + 1 - g, j + g), at(i + 1 - g, j + 1 - g), at(i + g, j + 1 - g)].join(" "), color });
    }
  }
  return cells;
}

const ICON_CELLS = [
  // Top (D shown up): from the back vertex, to the right and to the left.
  ...faceCells([0, -3 * K], [C30, 0.5], [-C30, 0.5], FACELET_COLORS.D).map((c) => ({ ...c, shade: 1 })),
  // Front-left: from the top face's left vertex, along the edge down to the front vertex, then down.
  ...faceCells([-3 * C30 * K, -1.5 * K], [C30, 0.5], [0, 1], FACELET_COLORS.F).map((c) => ({ ...c, shade: 0.82 })),
  // Front-right: from the front vertex, up and to the right, then down.
  ...faceCells([0, 0], [C30, -0.5], [0, 1], FACELET_COLORS.R).map((c) => ({ ...c, shade: 0.68 })),
];
const ICON_BODY = `0,${-3 * K} ${3 * C30 * K},${-1.5 * K} ${3 * C30 * K},${1.5 * K} 0,${3 * K} ${-3 * C30 * K},${1.5 * K} ${-3 * C30 * K},${-1.5 * K}`;

function StageCubeIcon() {
  return (
    <svg viewBox="-56 -64 112 128" aria-hidden="true" focusable="false">
      <polygon points={ICON_BODY} fill="#101014" stroke="#101014" strokeWidth={3} strokeLinejoin="round" />
      {ICON_CELLS.map((c, i) => (
        <polygon key={i} points={c.points} fill={c.color} fillOpacity={c.shade} />
      ))}
    </svg>
  );
}

/**
 * Bars that hold the replay controls' place (play row, scrubber, note line) while the player loads, so the
 * move text and everything under it don't jump when the controls arrive.
 */
export function ReplayControlsSkeleton({ withTicks = true }: { withTicks?: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-2" aria-hidden="true" data-testid="replay-controls-skeleton">
      <div className="flex h-10 items-center justify-center gap-2">
        <span className="replay-skel h-10 w-[5.5rem]" />
        <span className="replay-skel h-10 w-[9.5rem]" />
        <span className="replay-skel h-10 w-10" />
      </div>
      <div className="flex h-7 w-full max-w-sm items-center gap-3">
        <span className="replay-skel h-1 flex-1" />
        <span className="replay-skel h-3 w-[5.5rem]" />
      </div>
      {withTicks && <span className="-mt-2 h-3.5" />}
      <span className="replay-skel h-7 w-48" />
    </div>
  );
}

/**
 * What a replay shows while its player's own code is still downloading (the dynamic() import's `loading`):
 * the same stage box and a controls skeleton, so the sheet is the right size from the first frame.
 */
export function ReplayPlaceholder({ className }: { className?: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-3" role="status" aria-label="Loading the replay">
      <CubeStage className={className} state="loading" />
      <ReplayControlsSkeleton />
    </div>
  );
}
