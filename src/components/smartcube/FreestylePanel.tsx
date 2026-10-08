"use client";

import { Loader2, Shuffle } from "lucide-react";
import { useFreestyleStore } from "@/lib/store/freestyleStore";
import { FREESTYLE_MIN_TURNS } from "@/lib/smartcube/freestyle";

/** The Freestyle prompt: mix the cube however you like, hold still, and that's the scramble. */
export function FreestylePanel({ onCaptureNow, onUseAnyway }: { onCaptureNow: () => void; onUseAnyway: () => void }) {
  const { status, turns, easyMoves } = useFreestyleStore();

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 border-t border-border px-4 pt-3 text-center" data-testid="freestyle-panel">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Shuffle size={15} className="text-accent" /> Freestyle scramble
      </p>
      {status === "checking" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Reading your scramble off the cube…
        </p>
      ) : status === "easy" ? (
        <>
          <p className="text-xs text-warning">
            That&apos;s only {easyMoves} move{easyMoves === 1 ? "" : "s"} from solved, an easy case, not a scramble. Keep mixing, or:
          </p>
          <button type="button" onClick={onUseAnyway} className="rounded-md bg-bg-panel-2 px-3 py-1 text-xs font-medium text-foreground hover:bg-bg-panel">
            Use it anyway
          </button>
        </>
      ) : status === "failed" ? (
        <p className="text-xs text-danger">Couldn&apos;t read that state, it may be out of sync. Turn once more, or solve it and tap &ldquo;Cube out of sync?&rdquo;.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Mix the cube any way you like, then hold still for a couple of seconds, that state becomes your scramble, and inspection starts.
          </p>
          <p className="text-[11px] text-muted-2">
            {turns === 0 ? "Waiting for the first turn…" : `${turns} turn${turns === 1 ? "" : "s"}${turns < FREESTYLE_MIN_TURNS ? `, keep going, ${FREESTYLE_MIN_TURNS - turns} more at least` : ", pause when you're done"}`}
          </p>
          <button type="button" onClick={onCaptureNow} className="text-[11px] text-muted-2 underline hover:text-muted">
            Already mixed it? Use the cube as it is now
          </button>
        </>
      )}
    </div>
  );
}
