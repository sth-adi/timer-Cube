import type { Solve } from "@/types";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { avg } from "@/lib/analytics/solveMetrics";

/**
 * Cold Start Tax: right after a pause to look, are your first few turns
 * slower than your steady turning speed — a motor "cold start" separate
 * from *why* you paused? This is deliberately different from both Cadence
 * (evenness of turn spacing, regardless of pauses) and Tilt Meter (whether
 * a flagged *mistake* slows the phase after it): here every pause counts,
 * mistake or not, and only the handful of turns right after it are graded
 * against the rest of the same solve.
 *
 * Works off raw move timestamps only, no cube replay — every smart-cube
 * capture qualifies, not just ones that resolve into clean CFOP phases.
 */

/** Turns right after a pause counted as "cold" before folding back into the steady-state baseline. */
export const COLD_WINDOW = 3;

export interface GapClassification {
  /** Turning gaps (< PAUSE_MS) inside the COLD_WINDOW turns right after a pause. */
  cold: number[];
  /** Every other turning gap — the steady-state baseline. */
  warm: number[];
}

/**
 * Pure classification of one solve's gaps into cold vs warm. `gap[i]` is the
 * time before `tokens[i]`, so a pause ending right before move `i` marks
 * `tokens[i+1..i+COLD_WINDOW]`'s gaps as cold — stopping early if another
 * pause interrupts the window (that next stretch gets graded from its own
 * pause instead, not blamed on this one).
 */
export function classifyGaps(tokens: readonly string[], timesMs: readonly number[]): GapClassification {
  const cold: number[] = [];
  const warm: number[] = [];
  if (tokens.length !== timesMs.length) return { cold, warm };

  const gaps: number[] = [];
  for (let i = 1; i < timesMs.length; i++) gaps.push(timesMs[i] - timesMs[i - 1]);

  let coldRemaining = 0;
  for (const gap of gaps) {
    if (gap <= 0) continue;
    if (gap >= PAUSE_MS) {
      coldRemaining = COLD_WINDOW;
      continue;
    }
    if (coldRemaining > 0) {
      cold.push(gap);
      coldRemaining--;
    } else {
      warm.push(gap);
    }
  }
  return { cold, warm };
}

export interface ColdStartReport {
  coldAvgMs: number;
  warmAvgMs: number;
  /** coldAvgMs - warmAvgMs: positive means the turns right after a look are genuinely slower. */
  taxMs: number;
  taxShare: number;
  coldSamples: number;
  warmSamples: number;
  hasColdStart: boolean;
  headline: string;
}

export const MIN_SAMPLES = 40;
const TAX_THRESHOLD_MS = 15;

/** Aggregates already-classified gaps into the report — split out so the maths is testable without solves. */
export function summarizeColdStart(classifications: readonly GapClassification[]): ColdStartReport | null {
  const cold = classifications.flatMap((c) => c.cold);
  const warm = classifications.flatMap((c) => c.warm);
  if (cold.length < MIN_SAMPLES || warm.length < MIN_SAMPLES) return null;

  const coldAvgMs = avg(cold);
  const warmAvgMs = avg(warm);
  const taxMs = coldAvgMs - warmAvgMs;
  const taxShare = warmAvgMs > 0 ? taxMs / warmAvgMs : 0;
  const hasColdStart = taxMs >= TAX_THRESHOLD_MS;

  const parts = [`Your first ${COLD_WINDOW} turns after a look average ${Math.round(coldAvgMs)}ms/turn, versus ${Math.round(warmAvgMs)}ms/turn once you're warmed back up.`];
  parts.push(
    hasColdStart
      ? `That's a real cold-start tax — about ${Math.round(taxShare * 100)}% slower right out of a pause.`
      : "That's within noise of your normal turning speed — no real cold start.",
  );

  return { coldAvgMs, warmAvgMs, taxMs, taxShare, coldSamples: cold.length, warmSamples: warm.length, hasColdStart, headline: parts.join(" ") };
}

export function analyzeColdStart(solves: readonly Solve[]): ColdStartReport | null {
  const classifications = solves
    .filter((s) => s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 1 && s.penalty !== "dnf")
    .map((s) => classifyGaps(s.reconstruction!.split(/\s+/).filter(Boolean), s.moveTimestamps!));
  return summarizeColdStart(classifications);
}
