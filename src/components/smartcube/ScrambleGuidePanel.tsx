"use client";

import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Undo2 } from "lucide-react";
import { RouteChips, turnArrow } from "@/components/smartcube/RouteChips";
import { scrambleWindow, type ScrambleWindow } from "@/components/smartcube/scrambleWindow";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { cn } from "@/lib/utils/cn";

const swatch = (token: string) => FACELET_COLORS[token[0]] ?? "transparent";

/**
 * The turn to make now, big, with the next two smaller beside it. Fixed
 * height, so the panel doesn't move as the scramble advances. Done / now /
 * next differ in size and edge style, not just colour.
 */
function NowAndNext({ w, partial }: { w: ScrambleWindow; partial: boolean }) {
  return (
    <div role="group" aria-label="Current turn and next turns" className="flex h-[100px] items-center justify-center gap-4">
      {w.now ? (
        <div
          aria-current="step"
          className="relative flex h-[84px] min-w-[76px] flex-col items-center justify-center gap-1 rounded-xl bg-accent px-4 font-mono text-accent-fg outline outline-2 outline-offset-2 outline-foreground"
        >
          <span className="sr-only">Now: </span>
          <span className="text-4xl font-bold leading-none">{w.now.token}</span>
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="text-xs font-bold leading-none">{turnArrow(w.now.token)}</span>
            <span className="h-1.5 w-7 rounded-full ring-1 ring-black/20" style={{ background: swatch(w.now.token) }} />
          </span>
          {partial && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-warning px-1.5 text-[10px] text-black">½</span>}
        </div>
      ) : (
        <div aria-hidden className="flex h-[84px] min-w-[76px] items-center justify-center rounded-xl bg-bg-panel-2 text-success">
          <CheckCircle2 size={32} />
        </div>
      )}
      {w.next.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-[10px] font-semibold text-muted-2">
            then
          </span>
          {w.next.map((step, i) => (
            <span
              key={step.index}
              className={cn(
                "flex h-12 min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-muted-2 bg-bg-panel-2 px-1.5 font-mono text-lg font-bold leading-none text-foreground",
                i > 0 && "opacity-70",
              )}
            >
              <span className="sr-only">Next: </span>
              {step.token}
              <span aria-hidden className="h-1 w-4 rounded-full ring-1 ring-black/20" style={{ background: swatch(step.token) }} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ w }: { w: ScrambleWindow }) {
  return (
    <div className="flex w-full max-w-xs items-center gap-2">
      <div
        role="progressbar"
        aria-label="Scramble progress"
        aria-valuemin={0}
        aria-valuemax={w.total}
        aria-valuenow={w.done}
        aria-valuetext={w.valueText}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-panel-2"
      >
        <div className="h-full rounded-md bg-accent transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${w.progress * 100}%` }} />
      </div>
      <span aria-hidden className="min-w-[3.5rem] text-right font-mono text-[11px] tabular-nums text-muted">
        {w.label}
      </span>
    </div>
  );
}

/**
 * The scramble as the turn you're on, big, with the next two beside it and a
 * thin progress bar; the full list of turns sits behind "Show all". A wrong
 * turn swaps the instruction for the turns that undo it — newest first,
 * disappearing as you make them — and the scramble picks up again from the
 * same step once you're back.
 */
export function ScrambleGuidePanel() {
  const { status, view, rerouted } = useScrambleGuideStore();
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

  if (status === "planning" || (status === "guiding" && !view)) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-2">
        <Loader2 size={12} className="animate-spin" /> Working out the turns from how your cube is right now…
      </p>
    );
  }
  if (!view) return null;

  const offTrack = view.undo.length > 0;
  const total = view.steps.length;
  const w = scrambleWindow(view.steps, view.index);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {offTrack ? (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-lg bg-warning/10 px-3 py-3 text-center ring-1 ring-warning/40">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Undo2 size={15} /> Wrong turn, undo {view.undo.length === 1 ? "this" : `these ${view.undo.length}`}
          </p>
          <RouteChips display={view.undo} turns={view.undo} position={0} size="lg" />
          <p className="text-[11px] text-muted">
            {view.partial
              ? `Then finish the ${view.steps[view.index]} you'd started.`
              : view.fix
                ? `Then turn ${view.fix} to finish step ${view.index + 1}.`
                : `Then carry on from step ${view.index + 1}.`}
          </p>
        </div>
      ) : view.fix ? (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-lg bg-warning/10 px-3 py-3 text-center ring-1 ring-warning/40">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <AlertTriangle size={15} /> Not quite, turn this to fix step {view.index + 1}
          </p>
          <RouteChips display={[view.fix]} turns={[view.fix]} position={0} size="lg" />
        </div>
      ) : view.done ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 size={15} /> Scrambled
        </p>
      ) : (
        <p className="min-h-4 text-xs text-muted">{view.partial && "Half done, same way again"}</p>
      )}

      {total > 0 && (
        <div className={cn("flex w-full flex-col items-center gap-2 transition-opacity motion-reduce:transition-none", (offTrack || view.fix) && "opacity-40")}>
          <NowAndNext w={w} partial={view.partial} />
          <ProgressBar w={w} />
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            aria-controls={listId}
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {showAll ? "Hide all" : "Show all"} {total} turns
            <ChevronDown size={12} className={cn("transition-transform motion-reduce:transition-none", showAll && "rotate-180")} />
          </button>
          <div id={listId} hidden={!showAll}>
            {showAll && <RouteChips display={view.steps} turns={view.steps} position={view.index} partial={view.partial} cues ariaLabel="All scramble turns" />}
          </div>
        </div>
      )}

      {rerouted && (
        <p className="max-w-xs text-center text-[10px] text-muted-2">
          These turns take your cube from where it is to the scramble, it wasn&apos;t solved when you started, or it went too far off to undo.
        </p>
      )}
    </div>
  );
}
