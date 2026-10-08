"use client";

import type { CSSProperties } from "react";
import type { PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { PHASE_LABELS_4, fillOffsetPct, isSlow, ribbonSegments, segmentFill, segmentState } from "@/components/timer/phaseRibbonMath";
import { useSmoothedValue } from "@/components/motion";
import { cn } from "@/lib/utils/cn";
import "@/styles/live-solve.css";
import "@/styles/moments.css";

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

/** A fill that moves by more than this many percent of a segment in one render is a jump (a phase landing), and glides. */
const FILL_JUMP_PCT = 2.5;

/**
 * One segment's fill and, while its phase is being timed, the bright leading edge. The fill follows
 * the clock exactly while it just grows; a jump in it (a phase boundary, the stop) is eased by the
 * shared smoother rather than stepping. Reduced motion draws the true value.
 */
function RibbonFill({ fill, current, solidClass }: { fill: number; current: boolean; solidClass: string }) {
  const shown = useSmoothedValue(fill, { jumpAbove: FILL_JUMP_PCT, min: 0, max: 100 });
  const offset = fillOffsetPct(shown);
  return (
    <>
      <div className={cn("phase-ribbon-fill absolute inset-0 rounded-full", solidClass)} style={{ transform: `translate3d(${offset}%,0,0)` }} />
      {current && shown > 0.5 && <div aria-hidden className="phase-ribbon-head absolute inset-0" style={{ transform: `translate3d(${offset + 100}%,0,0)` }} />}
    </>
  );
}

/**
 * The solve as one strip: Cross, F2L, OLL, PLL sized by how long each usually takes you. Each
 * segment fills against its own time, with a thin tick where your median (or, without enough
 * history, your best) for that phase falls; a phase that runs past 1.3x the median turns amber,
 * the same line the split chips use. F2L carries four notches that light as pairs go in, and every
 * segment is labelled with its letter (plus a tick mark when done, a star for a new best) so the
 * strip never relies on colour alone. The height is fixed whatever the values do.
 *
 * Motion is transform-only (styles/live-solve.css): the fill slides rather than resizes (and a jump in it is eased by useSmoothedValue), the phase
 * being timed carries a bright leading edge, and a phase boundary landing makes that segment swell
 * and settle. `entrance` (the recap) fills the strip in once, left to right, instead.
 */
export function PhaseRibbon({
  durations,
  currentPhaseIndex,
  liveCurrentMs,
  baseline,
  bests,
  f2lPairCount,
  gold,
  entrance = false,
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
  /** Fill the strip in once on mount (the recap) rather than appearing already full. */
  entrance?: boolean;
}) {
  const segments = ribbonSegments(
    PHASE_LABELS_4.map((_, i) => baseline?.phases[i]?.medianMs ?? null),
    bests,
  );
  const doneCount = durations.filter((d) => d !== null).length;
  const valueText = currentPhaseIndex >= 0 && currentPhaseIndex < 4 ? `${PHASE_LABELS_4[currentPhaseIndex]} in progress, ${doneCount} of 4 done` : "All four phases done";
  return (
    <div
      className={cn("phase-ribbon flex w-full max-w-xs gap-[3px]", entrance && "phase-ribbon--entrance")}
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
        const state = segmentState(doneMs, i, currentPhaseIndex);
        const done = state === "done";
        const current = state === "current";
        const ms = done ? (doneMs ?? 0) : current ? (liveCurrentMs ?? 0) : 0;
        const fill = done || current ? segmentFill(ms, seg) : 0;
        const slow = (done || current) && isSlow(ms, seg);
        const tint = RIBBON_TINT[i];
        return (
          <div
            key={label}
            className="phase-ribbon-seg flex min-w-0 flex-col gap-1.5"
            style={{ flexGrow: seg.spanMs, flexBasis: 0, "--ribbon-i": i } as CSSProperties}
            data-slow={slow || undefined}
            data-done={done || undefined}
            data-current={current || undefined}
            title={label}
          >
            <div className={cn("phase-ribbon-track relative h-2.5 overflow-hidden rounded-full", tint.soft)}>
              <RibbonFill fill={fill} current={current} solidClass={slow ? "bg-warning" : tint.solid} />
              {gold[i] && done && (
                <span aria-hidden data-testid="ribbon-gold" className="phase-ribbon-gold absolute inset-y-0 w-[3px] -translate-x-full rounded-full" style={{ left: `${Math.max(fill, 4)}%` }} />
              )}
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
                    className={cn("phase-ribbon-notch absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full", f2lPairCount > k ? "bg-foreground" : "bg-foreground/30")}
                    style={{ left: `${p}%` }}
                  />
                ))}
            </div>
            <span
              className={cn(
                "phase-ribbon-label flex items-center justify-center gap-0.5 text-[11px] font-semibold leading-none",
                gold[i] ? "text-warning" : slow ? "text-warning" : current ? "text-foreground" : done ? "text-muted" : "text-muted-2",
              )}
            >
              {/* The letter stays dead centre; the mark hangs off its left so nothing shifts when a phase lands. */}
              <span aria-hidden className="relative">
                {(gold[i] || done) && <span className="phase-ribbon-mark absolute right-full top-1/2 mr-[3px] -translate-y-1/2">{gold[i] ? "★" : "✓"}</span>}
                {PHASE_LETTER[i]}
              </span>
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
