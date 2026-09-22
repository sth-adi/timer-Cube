"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { computeReplayGaps } from "@/lib/analysis/replayGaps";

const TimedCubePlayer = dynamic(() => import("./TimedCubePlayer").then((m) => m.TimedCubePlayer), {
  ssr: false,
});

interface InstantReplaySheetProps {
  scramble: string;
  reconstruction: string;
  timeMs: number;
  /** Elapsed ms from solve start for each move, one-for-one with `reconstruction`'s tokens — real capture timing off a smart cube, not a retyped guess. */
  moveTimestamps?: number[];
  onClose: () => void;
}

/**
 * A zero-latency "watch it back" view: scramble, reconstruction, and a
 * real-paced 3D replay, all from data already sitting in memory — no
 * analyzeSolve() worker round trip, no navigating away from the timer. This
 * is deliberately lighter than the full Analyzer (no phase-by-phase
 * optimal-solution comparison): it's the fast "let me see that again" replay
 * Cubeast's own post-solve screen offers, not a second copy of the analyzer.
 */
export function InstantReplaySheet({ scramble, reconstruction, timeMs, moveTimestamps, onClose }: InstantReplaySheetProps) {
  const moves = useMemo(() => reconstruction.trim().split(/\s+/).filter(Boolean), [reconstruction]);

  const { gaps, hasRealTiming } = useMemo(() => computeReplayGaps(moves, moveTimestamps), [moveTimestamps, moves]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          "glass-panel w-full rounded-t-2xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[88vh] overflow-y-auto",
          "sm:max-w-sm sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Reconstruction</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 text-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-2 flex items-baseline gap-2">
          <span className="tabular-timer text-2xl font-bold text-foreground">{formatTime(timeMs)}</span>
          <span className="text-xs text-muted-2">{moves.length} moves</span>
        </p>

        <p className="mb-2 break-words rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">
          {scramble}
        </p>

        <TimedCubePlayer alg={reconstruction} setupAlg={scramble} gapsMs={gaps} hasRealTiming={hasRealTiming} className="mx-auto h-56 w-full max-w-xs" />

        <p className="mt-2 break-words text-center font-mono text-[11px] leading-relaxed text-foreground/80">
          {reconstruction || "no reconstruction captured"}
        </p>
      </div>
    </div>
  );
}
