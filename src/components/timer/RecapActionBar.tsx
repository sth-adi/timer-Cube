"use client";

import { Play, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Replay / Analyze / Done, pinned to the bottom of the scrolling pane once the recap is long, so
 * Done is never several screens down. On a phone it floats just above the bottom dock: the
 * scrolling pane already pads its bottom by the dock height plus the home-indicator inset, and a
 * sticky offset is measured from that padded edge, so a small gap is all it needs. On a wide
 * screen it is part of the left column and does not stick.
 */
export function RecapActionBar({ onReplay, onAnalyze, onDone, className }: { onReplay: () => void; onAnalyze: () => void; onDone: () => void; className?: string }) {
  return (
    <div
      role="group"
      aria-label="Solve actions"
      data-testid="recap-actions"
      className={cn(
        "sticky bottom-2 z-20 flex w-full gap-2 rounded-md border border-border bg-bg-elevated p-1.5 lg:static",
        className,
      )}
    >
      <button
        type="button"
        onClick={onReplay}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg"
        data-testid="recap-replay"
      >
        <Play size={16} aria-hidden="true" /> Replay
      </button>
      <button
        type="button"
        onClick={onAnalyze}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-bg-panel-2 px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
        data-testid="recap-analyze"
      >
        <Wand2 size={16} aria-hidden="true" /> Analyze
      </button>
      <button
        type="button"
        onClick={onDone}
        className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-bg-panel-2 px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
        data-testid="recap-done"
      >
        Done
      </button>
    </div>
  );
}
