"use client";

import { useState } from "react";
import { Boxes, RefreshCw } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { cn } from "@/lib/utils/cn";
import { ScrambleNet } from "./ScrambleNet";

export function ScrambleBar({ className }: { className?: string }) {
  const scramble = useScrambleStore((s) => s.scramble);
  const loading = useScrambleStore((s) => s.loadingScramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const [netOpen, setNetOpen] = useState(false);

  return (
    <div className={cn("flex flex-col items-center gap-3 px-4", className)}>
      <div className="flex items-start justify-center gap-3">
        <p className="tabular-timer max-w-3xl text-center text-lg sm:text-xl font-medium tracking-wide text-foreground/90 select-text">
          {loading && !scramble ? "Generating scramble…" : scramble}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setNetOpen((o) => !o)}
            disabled={loading || !scramble}
            aria-label="Show scramble diagram"
            aria-pressed={netOpen}
            className={cn(
              "tap-target rounded-full transition-colors disabled:opacity-40",
              netOpen ? "text-accent bg-accent-soft" : "text-muted hover:text-foreground hover:bg-bg-panel-2",
            )}
          >
            <Boxes size={17} />
          </button>
          <button
            type="button"
            onClick={() => nextScramble()}
            disabled={loading}
            aria-label="New scramble"
            className="tap-target rounded-full text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {netOpen && scramble && (
        <div className="card animate-fade-in-up w-full max-w-sm rounded-xl p-4">
          <ScrambleNet scramble={scramble} className="w-full" />
        </div>
      )}
    </div>
  );
}
