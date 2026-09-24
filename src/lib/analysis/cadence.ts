import type { Solve } from "@/types";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { avg, sd } from "@/lib/analytics/solveMetrics";

/**
 * Cadence: how *steady* your turning is, independent of how fast it is.
 * Two solves with the same average TPS can feel completely different to
 * turn through — one a smooth, evenly-spaced stream, the other bursts of
 * speed separated by little stutters (not full recognition pauses, just
 * ragged execution). This measures that raggedness directly: the spread of
 * the gaps between consecutive turns, relative to their mean — the
 * coefficient of variation, inverted onto a 0-100 "consistency" score.
 *
 * Deliberately doesn't need the cube to be legal or CFOP-shaped: it only
 * looks at gaps between timestamps, so it works on every smart-cube capture,
 * not just solves that replay cleanly.
 */

/** Below this many qualifying turning gaps, a solve's rhythm isn't a meaningful sample. */
const MIN_GAPS = 12;
/** A coefficient of variation at or above this maps to a consistency score of 0. */
const CV_FLOOR = 0.9;

export interface CadenceSolve {
  id: string;
  date: number;
  /** 0-100: higher means steadier turn-to-turn spacing. */
  consistency: number;
  meanGapMs: number;
  stdevGapMs: number;
  /** Turning gaps the score was computed from (pauses to look excluded). */
  gaps: number;
}

/** Coefficient-of-variation to a 0-100 score: 0 spread → 100, CV_FLOOR+ spread → 0. */
export function consistencyScore(meanGapMs: number, stdevGapMs: number): number {
  if (meanGapMs <= 0) return 0;
  const cv = stdevGapMs / meanGapMs;
  return Math.max(0, Math.min(100, Math.round((1 - cv / CV_FLOOR) * 100)));
}

/** One solve's cadence, or null when it lacks timing or a big enough sample of turns. */
export function cadenceForSolve(solve: Solve): CadenceSolve | null {
  if (!solve.reconstruction || !solve.moveTimestamps || solve.penalty === "dnf") return null;
  const tokens = solve.reconstruction.trim().split(/\s+/).filter(Boolean);
  const t = solve.moveTimestamps;
  if (tokens.length !== t.length || tokens.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const g = t[i] - t[i - 1];
    if (g > 0 && g < PAUSE_MS) gaps.push(g);
  }
  if (gaps.length < MIN_GAPS) return null;

  const meanGapMs = avg(gaps);
  const stdevGapMs = sd(gaps);
  return { id: solve.id, date: solve.date, consistency: consistencyScore(meanGapMs, stdevGapMs), meanGapMs, stdevGapMs, gaps: gaps.length };
}

export interface CadenceReport {
  /** Oldest first — a trend line. */
  solves: CadenceSolve[];
  avgConsistency: number;
  /** Average of the last 12 qualifying solves. */
  recentAvgConsistency: number;
  best: CadenceSolve;
  worst: CadenceSolve;
  headline: string;
}

export const MIN_SOLVES = 8;

export function cadenceReport(solves: readonly Solve[]): CadenceReport | null {
  const rows = solves
    .map(cadenceForSolve)
    .filter((s): s is CadenceSolve => s !== null)
    .sort((a, b) => a.date - b.date);
  if (rows.length < MIN_SOLVES) return null;

  const avgConsistency = avg(rows.map((r) => r.consistency));
  const recent = rows.slice(-12);
  const recentAvgConsistency = avg(recent.map((r) => r.consistency));
  const byScore = [...rows].sort((a, b) => b.consistency - a.consistency);
  const best = byScore[0];
  const worst = byScore[byScore.length - 1];

  const earlier = rows.slice(0, -12);
  const trendDeltaPts = earlier.length >= 5 ? recentAvgConsistency - avg(earlier.map((r) => r.consistency)) : null;

  const parts: string[] = [];
  parts.push(`Your turning rhythm averages ${Math.round(avgConsistency)}/100 across ${rows.length} timed solves.`);
  if (trendDeltaPts !== null && Math.abs(trendDeltaPts) >= 4) {
    parts.push(trendDeltaPts > 0 ? `It's gotten steadier lately — up ${Math.round(trendDeltaPts)} points over your recent solves.` : `It's gotten choppier lately — down ${Math.round(-trendDeltaPts)} points over your recent solves.`);
  }
  parts.push(`Steadiest was ${(best.meanGapMs / 1000).toFixed(2)}s/turn with almost no variation; roughest bounced between fast bursts and stutters.`);

  return { solves: rows, avgConsistency, recentAvgConsistency, best, worst, headline: parts.join(" ") };
}
