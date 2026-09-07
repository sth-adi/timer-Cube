"use client";

import { RefreshCw } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { cn } from "@/lib/utils/cn";

export function ScrambleBar({ className }: { className?: string }) {
  const scramble = useScrambleStore((s) => s.scramble);
  const loading = useScrambleStore((s) => s.loadingScramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);

  return (
    <div className={cn("flex items-start justify-center gap-3 px-4", className)}>
      <p className="tabular-timer max-w-3xl text-center text-lg sm:text-xl font-medium tracking-wide text-foreground/90 select-text">
        {loading && !scramble ? "Generating scramble…" : scramble}
      </p>
      <button
        type="button"
        onClick={() => nextScramble()}
        disabled={loading}
        aria-label="New scramble"
        className="mt-1 shrink-0 rounded-full p-2 text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors disabled:opacity-40"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
