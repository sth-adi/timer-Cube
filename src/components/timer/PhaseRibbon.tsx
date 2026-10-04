"use client";

import type { PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { PHASE_LABELS_4, isSlow, ribbonSegments, segmentFill } from "@/components/timer/phaseRibbonMath";
import { cn } from "@/lib/utils/cn";

const RIBBON_TINT = [
  { solid: "bg-accent", soft: "bg-accent/20" },
  { solid: "bg-cyan", soft: "bg-cyan/20" },
  { solid: "bg-warning", soft: "bg-warning/20" },
  { solid: "bg-success", soft: "bg-success/20" },
] as const;

/** One letter per phase, so the strip reads without its colours. */
const PHASE_LETTER = ["C", "F", "O", "P"] as const;

/** Where the four pair notches sit inside the F2L segment (% along it). */
const PAIR_NOTCHES = [12.5, 37.5, 62.5, 87.5] as const;

/**
 * The solve as one strip: Cross, F2L, OLL, PLL sized by how long each usually takes you. Each
 * segment fills against its own time, with a thin tick where your median (or, without enough
 * history, your best) for that phase falls; a phase that runs past 1.3x the median turns amber,
 * the same line the split chips use. F2L carries four notches that light as pairs go in, and every
 * segment is labelled with its letter (plus a tick mark when done, a star for a new best) so the
 * strip never relies on colour alone. The height is fixed whatever the values do.
 */
export function PhaseRibbon({
  durations,
  currentPhaseIndex,
  liveCurrentMs,
  baseline,
  bests,
  f2lPairCount,
  gold,
}: {
  durations: (number | null)[];
  currentPhaseIndex: number;
  liveCurrentMs: number | null;
  baseline?: PostSolveBaseline | null;
  /** Your best-ever time per phase — the tick's fallback while there is no median yet. */
  bests?: readonly (number | null)[];
  f2lPairCount: number;
  /** Steps that just set a new best — marked with a star. */
  gold: readonly boolean[];
}) {
  const segments = ribbonSegments(
    PHASE_LABELS_4.map((_, i) => baseline?.phases[i]?.medianMs ?? null),
    bests,
  );
  const doneCount = durations.filter((d) => d !== null).length;
  const valueText = currentPhaseIndex >= 0 && currentPhaseIndex < 4 ? `${PHASE_LABELS_4[currentPhaseIndex]} in progress, ${doneCount} of 4 done` : "All four phases done";
  return (
    <div
      className="flex w-full max-w-xs gap-[3px]"
      role="progressbar"
      aria-label="Solve progress"
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={Math.min(4, doneCount)}
      aria-valuetext={valueText}
    >
      {PHASE_LABELS_4.map((label, i) => {
        const seg = segments[i];
        const doneMs = durations[i];
        const done = doneMs !== null;
        const current = i === currentPhaseIndex && !done;
        const ms = done ? doneMs : current ? (liveCurrentMs ?? 0) : 0;
        const fill = done || current ? segmentFill(ms, seg) : 0;
        const slow = (done || current) && isSlow(ms, seg);
        const tint = RIBBON_TINT[i];
        return (
          <div key={label} className="flex min-w-0 flex-col gap-1" style={{ flexGrow: seg.spanMs, flexBasis: 0 }} data-slow={slow || undefined} title={label}>
            <div className={cn("relative h-2 overflow-hidden rounded-full", tint.soft, current && "ring-1 ring-foreground/15")}>
              <div
                className={cn("h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none", slow ? "bg-warning" : tint.solid, !done && !current && "opacity-0")}
                style={{ width: `${fill}%` }}
              />
              {seg.tickPct !== null && (
                <span
                  aria-hidden
                  data-tick={seg.tickKind ?? undefined}
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/80"
                  style={{ left: `${seg.tickPct}%` }}
                />
              )}
              {i === 1 &&
                PAIR_NOTCHES.map((p, k) => (
                  <span
                    key={p}
                    aria-hidden
                    data-lit={f2lPairCount > k || undefined}
                    className={cn("absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full", f2lPairCount > k ? "bg-foreground" : "bg-foreground/30")}
                    style={{ left: `${p}%` }}
                  />
                ))}
            </div>
            <span
              className={cn(
                "flex items-center justify-center gap-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider",
                gold[i] ? "text-warning" : slow ? "text-warning" : current ? "text-foreground" : done ? "text-muted" : "text-muted-2",
              )}
            >
              <span aria-hidden>{gold[i] ? "★" : done ? "✓" : ""}</span>
              <span aria-hidden>{PHASE_LETTER[i]}</span>
              <span className="sr-only">
                {label}
                {done ? ", done" : current ? ", in progress" : ""}
                {slow ? ", slower than usual" : ""}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
