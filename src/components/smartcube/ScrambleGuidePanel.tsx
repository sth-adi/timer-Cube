"use client";

import { AlertTriangle, CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { cn } from "@/lib/utils/cn";

/**
 * The scramble as a row of turns with the one you're on lit up. A wrong
 * turn swaps the instruction for the turns that undo it — newest first,
 * disappearing as you make them — and the scramble picks up again from the
 * same step once you're back.
 */
export function ScrambleGuidePanel() {
  const { status, view, rerouted } = useScrambleGuideStore();

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

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {offTrack ? (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl bg-warning/10 px-3 py-3 text-center ring-1 ring-warning/40">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Undo2 size={15} /> Wrong turn — undo {view.undo.length === 1 ? "this" : `these ${view.undo.length}`}
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
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl bg-warning/10 px-3 py-3 text-center ring-1 ring-warning/40">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <AlertTriangle size={15} /> Not quite — turn this to fix step {view.index + 1}
          </p>
          <RouteChips display={[view.fix]} turns={[view.fix]} position={0} size="lg" />
        </div>
      ) : view.done ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 size={15} /> Scrambled
        </p>
      ) : (
        <p className="text-xs text-muted">
          Step <span className="font-semibold text-foreground">{view.index + 1}</span> of {total}
          {view.partial && " — half done, same way again"}
        </p>
      )}

      <div className={cn("transition-opacity", (offTrack || view.fix) && "opacity-40")}>
        <RouteChips display={view.steps} turns={view.steps} position={view.index} partial={view.partial} />
      </div>

      {rerouted && (
        <p className="max-w-xs text-center text-[10px] text-muted-2">
          These turns take your cube from where it is to the scramble — it wasn&apos;t solved when you started, or it went too far off to undo.
        </p>
      )}
    </div>
  );
}
