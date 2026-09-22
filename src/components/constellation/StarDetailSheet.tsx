"use client";

import { X } from "lucide-react";
import type { ConstellationStar } from "@/lib/stats/constellation";
import { InstantReplaySheet } from "@/components/analysis/InstantReplaySheet";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/** Plain scramble/time/date sheet for a star whose solve has no captured reconstruction — most stars, since only smart-cube solves record one. */
function BareStarSheet({ star, onClose }: { star: ConstellationStar; onClose: () => void }) {
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
          <h2 className="text-base font-semibold">{star.isPB ? "PB at the time" : "Solve"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="tap-target -mr-2 text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 flex items-baseline gap-2">
          <span className="tabular-timer text-2xl font-bold text-foreground">{formatTime(star.finalMs)}</span>
          <span className="text-xs text-muted-2">{new Date(star.solve.date).toLocaleString()}</span>
        </p>
        <p className="mb-1 break-words rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">
          {star.solve.scramble}
        </p>
        <p className="text-[11px] text-muted-2">No reconstruction was captured for this solve — connect a smart cube to record one.</p>
      </div>
    </div>
  );
}

export function StarDetailSheet({ star, onClose }: { star: ConstellationStar; onClose: () => void }) {
  if (star.solve.reconstruction) {
    return (
      <InstantReplaySheet
        scramble={star.solve.scramble}
        reconstruction={star.solve.reconstruction}
        timeMs={star.finalMs}
        moveTimestamps={star.solve.moveTimestamps}
        onClose={onClose}
      />
    );
  }
  return <BareStarSheet star={star} onClose={onClose} />;
}
