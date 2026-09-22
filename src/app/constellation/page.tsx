"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { buildConstellation, type ConstellationStar } from "@/lib/stats/constellation";
import { StarField } from "@/components/constellation/StarField";
import { StarDetailSheet } from "@/components/constellation/StarDetailSheet";

/**
 * Every solve you've ever done (lifetime, every session — see allSolves),
 * plotted as a star in an explorable 3D field: left-right is speed, up-down
 * is how far this solve broke from your usual pace at the time, near-far is
 * when it happened. A PB glows gold. Drag to orbit, tap a star to replay it.
 * See lib/stats/constellation.ts for exactly what each axis means and why.
 */
export default function ConstellationPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const stars = useMemo(() => buildConstellation(allSolves), [allSolves]);
  const [selected, setSelected] = useState<ConstellationStar | null>(null);

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex h-dvh flex-col">
        <div className="flex items-center justify-between px-4 pt-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TimerIcon size={16} className="text-accent" />
            Cube
          </Link>
          <div className="text-right">
            <h1 className="text-sm font-semibold text-foreground">Solve Constellation</h1>
            <p className="text-[10px] text-muted-2">{stars.length} solves · drag to orbit</p>
          </div>
        </div>

        {stars.length < 5 ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <p className="max-w-xs text-sm text-muted">
              Do a few more solves to light up your constellation — every solve becomes a star once you have at least 5.
            </p>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <StarField stars={stars} onSelect={setSelected} />
            <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-4 rounded-full bg-bg-panel/80 px-4 py-1.5 text-[10px] text-muted-2 backdrop-blur">
              <span>← slower · faster →</span>
              <span>↑ ahead of pace · behind ↓</span>
              <span>near = recent</span>
            </div>
          </div>
        )}
      </div>

      {selected && <StarDetailSheet star={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
