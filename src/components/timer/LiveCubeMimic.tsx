"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";

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

  return <CubeViewer alg="" setupAlg={setupAlg} className={className} />;
}
