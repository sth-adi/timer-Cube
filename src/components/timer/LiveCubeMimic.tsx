"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), {
  ssr: false,
});

/**
 * Live 3D mirror of the physical smart cube: the scramble plus every move
 * reported so far gets fed into CubeViewer's `setupAlg`, which applies
 * silently/instantly rather than animating — so this always shows exactly
 * where the physical cube is *right now*, not a lagging replay of an
 * animation queue. Cheap to recompute on every move: CubeViewer reuses one
 * persistent player instance and just re-applies the setup, it never remounts.
 *
 * A brief ring pulse overlays each landed turn — pure CSS, keyed off the
 * move count so it retriggers every time without any JS animation-restart
 * logic — so a turn reads as *caught* the instant it happens, rather than
 * the cube silently changing under you with no acknowledgement at all.
 */
export function LiveCubeMimic({
  scramble,
  moves,
  className,
}: {
  scramble: string;
  moves: readonly SmartCubeMove[];
  className?: string;
}) {
  const setupAlg = useMemo(() => {
    const done = moves.map((m) => m.token).join(" ");
    return done ? `${scramble} ${done}` : scramble;
  }, [scramble, moves]);

  return (
    <div className={cn("relative", className)}>
      <CubeViewer alg="" setupAlg={setupAlg} className="h-full w-full" />
      {moves.length > 0 && <span key={moves.length} aria-hidden className="pointer-events-none absolute inset-0 rounded-xl animate-[turn-flash_220ms_ease-out]" />}
    </div>
  );
}
