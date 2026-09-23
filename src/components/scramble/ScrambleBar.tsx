"use client";

import { useState } from "react";
import { Boxes, Check, ChevronLeft, Copy, RefreshCw, Swords } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { WCA_EVENTS } from "@/types";
import { cn } from "@/lib/utils/cn";
import { ScrambleNet } from "./ScrambleNet";

export function ScrambleBar({ className }: { className?: string }) {
  const scramble = useScrambleStore((s) => s.scramble);
  const loading = useScrambleStore((s) => s.loadingScramble);
  const nextScramble = useScrambleStore((s) => s.nextScramble);
  const previousScramble = useScrambleStore((s) => s.previousScramble);
  const historyIndex = useScrambleStore((s) => s.historyIndex);
  const practiceMode = useScrambleStore((s) => s.practiceMode);
  const event = useScrambleStore((s) => s.event);
  // While a smart cube is being scrambled, the steps light up as you make them.
  const guide = useScrambleGuideStore();
  const guided = guide.scramble === scramble && !guide.rerouted && guide.view ? guide.view : null;
  const offTrack = !!guided && (guided.undo.length > 0 || guided.fix !== null);
  // The 2D scramble diagram is a hardcoded 3x3 net — not meaningful for other puzzle sizes.
  const netAvailable = event === "333";
  const [netOpen, setNetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const onCopyChallengeLink = async () => {
    if (!scramble) return;
    try {
      const url = `${window.location.origin}${window.location.pathname}?scramble=${encodeURIComponent(scramble)}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      // Same clipboard caveat as onCopy above.
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3 px-4", className)}>
      <div className="flex items-center gap-1.5">
        {event !== "333" && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            {WCA_EVENTS.find((e) => e.id === event)?.label}
          </span>
        )}
        {(event !== "333" || practiceMode) && (
          <span
            className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
            title={
              event !== "333"
                ? "A random-move scramble for this puzzle size — not a true random-state competition scramble."
                : undefined
            }
          >
            {event !== "333" ? "Random-move — not WCA-legal" : "Practice scramble — not WCA-legal"}
          </span>
        )}
      </div>
      <div className="flex items-start justify-center gap-2">
        <p className="tabular-timer max-w-3xl text-center text-lg sm:text-xl font-medium tracking-wide text-foreground/90 select-text">
          {loading && !scramble
            ? "Generating scramble…"
            : guided
              ? guided.steps.map((t, i) => (
                  <span key={i}>
                    {i > 0 && " "}
                    <span
                      className={cn(
                        "inline-block rounded px-[0.15em] transition-colors",
                        i < guided.index && "text-muted-2 opacity-50",
                        i === guided.index &&
                          (offTrack ? "text-warning ring-1 ring-warning" : "bg-accent text-accent-fg"),
                      )}
                    >
                      {t}
                      {i === guided.index && guided.partial && <sup className="ml-0.5 text-[0.6em]">½</sup>}
                    </span>
                  </span>
                ))
              : scramble}
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
          {netAvailable && (
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
          )}
          <button
            type="button"
            onClick={onCopyChallengeLink}
            disabled={!scramble}
            aria-label="Copy a link a friend can use to race this exact scramble"
            title="Copy challenge link"
            className={cn(
              "tap-target rounded-full transition-colors disabled:opacity-40",
              linkCopied ? "text-success" : "text-muted hover:text-foreground hover:bg-bg-panel-2",
            )}
          >
            {linkCopied ? <Check size={17} /> : <Swords size={16} />}
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

      {netAvailable && netOpen && scramble && (
        <div className="card animate-fade-in-up w-full max-w-sm rounded-xl p-4">
          <ScrambleNet scramble={scramble} className="w-full" />
        </div>
      )}
    </div>
  );
}
