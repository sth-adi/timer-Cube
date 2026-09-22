import type { Solve } from "@/types";
import { PHASE_LABELS, type PhaseCount } from "@/lib/store/settingsStore";
import { computePhaseSplits, computeSessionStats } from "./stats";

export interface DnaAxis {
  label: string;
  /** 0-100, always self-referential (a ratio against this solver's own best/mean) — never a made-up absolute scale, so it's honest at any skill level. */
  score: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** A solve count past which "Volume" reads as effectively maxed out — a soft, generous milestone, not a claim that 200 is some universal ceiling. */
const VOLUME_MAX_SOLVES = 200;

/**
 * A solver's "DNA": a handful of 0-100 axes, each one a ratio against that
 * same solver's own personal-best for that dimension — 100 means "your
 * average matches your peak," never a comparison against anyone else or an
 * arbitrary absolute scale. That self-referential design is what makes this
 * meaningful at any skill level, from a first-week cuber to a WR holder,
 * without a hand-tuned difficulty curve.
 *
 * Always includes Speed, Consistency, and Volume once there's enough data
 * (see MIN_SOLVES_FOR_DNA below); per-phase axes (Cross, F2L, OLL, PLL, or
 * whatever this session's phase-count setting produces) are added on top
 * whenever phase-split data exists, straight from the same
 * `computePhaseSplits` the live timer's own pace dots already use.
 */
export function computeDnaAxes(solves: Solve[]): DnaAxis[] {
  const stats = computeSessionStats(solves);
  const axes: DnaAxis[] = [];

  if (stats.best !== null && stats.mean !== null && stats.mean > 0) {
    axes.push({ label: "Speed", score: clamp(100 * (stats.best / stats.mean)) });
  }
  if (stats.stdDev !== null && stats.mean !== null && stats.mean > 0) {
    axes.push({ label: "Consistency", score: clamp(100 * (1 - stats.stdDev / stats.mean)) });
  }
  axes.push({ label: "Volume", score: clamp((stats.count / VOLUME_MAX_SOLVES) * 100) });

  const phaseSummary = computePhaseSplits(solves, (n) => PHASE_LABELS[n as PhaseCount] ?? []);
  if (phaseSummary) {
    for (const p of phaseSummary.phases) {
      if (p.meanMs > 0) axes.push({ label: p.label, score: clamp(100 * (p.bestMs / p.meanMs)) });
    }
  }

  return axes;
}

/** Below this, stdDev (needed for Consistency) is unreliable and the shape reads as a degenerate sliver rather than a meaningful fingerprint. */
export const MIN_SOLVES_FOR_DNA = 5;
