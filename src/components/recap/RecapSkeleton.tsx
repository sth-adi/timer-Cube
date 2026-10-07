"use client";

import { useEffect, useState } from "react";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { skeletonWidth } from "@/components/ui/skeletonWidths";
import { cn } from "@/lib/utils/cn";
import { RecapCard } from "./RecapParts";

/** A solve normally lands in the history within a blink; if it has not by now it is not coming, so the placeholder goes. */
const GIVE_UP_MS = 4000;

/**
 * "Where the time went" while the solve that was just finished is still being saved (the card is rebuilt from
 * the saved row): the same card, header, headline and one row per step, so the real card replaces it in place.
 * Gives up after a few seconds rather than hold a placeholder for a solve that never arrives.
 */
export function TimeWonLostSkeleton({ steps }: { steps: number }) {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (gaveUp) return null;
  const rows = Math.max(2, Math.min(8, steps));
  return (
    <RecapCard>
      <SkeletonGroup label="Working out where the time went" delayMs={150}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-5 w-[78%]" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={cn("grid min-h-6 items-center gap-x-2", "grid-cols-[3.5rem_minmax(0,1fr)_3.75rem_3.75rem]")}>
              <Skeleton className="h-3" style={{ width: skeletonWidth(i, 60, 90) }} />
              <Skeleton round className="h-2" style={{ width: skeletonWidth(i + 2, 25, 90) }} />
              <Skeleton className="ml-auto h-3 w-11" />
              <Skeleton className="ml-auto h-3 w-11" />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </RecapCard>
  );
}
