/** Cross, F2L, OLL, PLL — the four phases the live ribbon and chips track. */
export const PHASE_LABELS_4 = ["Cross", "F2L", "OLL", "PLL"] as const;

/** Rough share of a solve each step takes, used to size the ribbon until your own history says otherwise. */
export const DEFAULT_PHASE_WEIGHT_MS = [1500, 6500, 3500, 1200] as const;

/** A phase running past this many times your median is "slow" — the same line the split chips use (see paceFor). */
export const SLOW_RATIO = 1.3;
/** A segment spans this many times its reference time, so there is room past the tick to show an overrun. */
export const SEGMENT_SPAN_RATIO = 1.6;

export interface RibbonSegment {
  /** How much of the ribbon the segment gets (its span in ms): proportional to the reference, so segment widths follow your usual shape. */
  spanMs: number;
  /** Where the tick sits (% along the segment), null when there is no history to mark. */
  tickPct: number | null;
  /** Which of your times the tick marks. */
  tickKind: "median" | "best" | null;
  /** Past this many ms the phase counts as slow (amber); null without a median. */
  slowAtMs: number | null;
}

/** One segment per phase, from your median per phase (preferred) or best per phase, else the default shape. */
export function ribbonSegments(medians: readonly (number | null | undefined)[], bests: readonly (number | null | undefined)[] = []): RibbonSegment[] {
  return PHASE_LABELS_4.map((_, i) => {
    const median = medians[i] && medians[i]! > 0 ? medians[i]! : null;
    const best = bests[i] && bests[i]! > 0 ? bests[i]! : null;
    const ref = median ?? best;
    const spanMs = Math.max(500, ref ?? DEFAULT_PHASE_WEIGHT_MS[i]) * SEGMENT_SPAN_RATIO;
    return {
      spanMs,
      tickPct: ref === null ? null : Math.min(100, (ref / spanMs) * 100),
      tickKind: median !== null ? "median" : best !== null ? "best" : null,
      slowAtMs: median !== null ? median * SLOW_RATIO : null,
    };
  });
}

/** How full a segment is (0-100) for a phase that has run for `ms`. Finished phases fill to the end of what they took, capped at the segment. */
export function segmentFill(ms: number, segment: RibbonSegment): number {
  if (!(ms > 0)) return 0;
  return Math.min(100, (ms / segment.spanMs) * 100);
}

export function isSlow(ms: number | null, segment: RibbonSegment): boolean {
  return ms !== null && segment.slowAtMs !== null && ms > segment.slowAtMs;
}

/**
 * Where a segment's fill sits, as a translate (% of the segment's own width): 0 is full, -100 is
 * empty. The ribbon slides a full-width, rounded bar instead of resizing it, so a frame never
 * triggers layout and the bar's rounded end stays round however far along it is. Rounded to 0.05%
 * (a hundredth of a pixel on the widest segment) so a steady phase doesn't rewrite its style for noise.
 */
export function fillOffsetPct(fillPct: number): number {
  const f = Math.min(100, Math.max(0, Number.isFinite(fillPct) ? fillPct : 0));
  return Math.round((f - 100) * 20) / 20;
}

/** Whether a segment is finished, being timed right now, or not reached yet. */
export type SegmentState = "done" | "current" | "pending";

export function segmentState(durationMs: number | null, index: number, currentPhaseIndex: number): SegmentState {
  if (durationMs !== null) return "done";
  return index === currentPhaseIndex ? "current" : "pending";
}
