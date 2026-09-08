"use client";

import { useState } from "react";
import { Boxes, Check, ChevronLeft, Copy, RefreshCw } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { cn } from "@/lib/utils/cn";
import { ScrambleNet } from "./ScrambleNet";

export function ScrambleBar({ className }: { className?: string }) {
  const scramble = useScrambleStore((s) => s.scramble);
  const loading = useScrambleStore((s) => s.loadingScramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const previousScramble = useScrambleStore((s) => s.previousScramble);
  const historyIndex = useScrambleStore((s) => s.historyIndex);
  const [netOpen, setNetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!scramble) return;
    try {
      await navigator.clipboard.writeText(scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be blocked (insecure origin, denied permission) — the
      // scramble is selectable text either way, so this needs no error UI.
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3 px-4", className)}>
      <div className="flex items-start justify-center gap-2">
        <p className="tabular-timer max-w-3xl text-center text-lg sm:text-xl font-medium tracking-wide text-foreground/90 select-text">
          {loading && !scramble ? "Generating scramble…" : scramble}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={previousScramble}
            disabled={historyIndex <= 0}
            aria-label="Previous scramble"
            className="tap-target rounded-full text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={!scramble}
            aria-label="Copy scramble"
            className={cn(
              "tap-target rounded-full transition-colors disabled:opacity-40",
              copied ? "text-success" : "text-muted hover:text-foreground hover:bg-bg-panel-2",
            )}
          >
            {copied ? <Check size={17} /> : <Copy size={16} />}
          </button>
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
