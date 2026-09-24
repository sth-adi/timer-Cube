import type { Solve } from "@/types";
import { simplify } from "@/lib/smartcube/route";
import { avg } from "@/lib/analytics/solveMetrics";
import { fitCurve, rollingMean, type Curve } from "@/lib/analytics/progress";

/**
 * Move Economy Trend: Progress Forecast fits a learning curve to your solve
 * *times*; this fits the exact same curve to your solve *move counts*. Time
 * can drop just from turning faster with no fewer moves, or move count can
 * drop with no faster fingers — they're genuinely different skills, so this
 * gets its own trend rather than reading it off Progress Forecast's numbers.
 *
 * Needs only a saved reconstruction — not full timing — so it works on
 * every analyzed solve, smart-cube captured or hand-reconstructed alike.
 */

export const MIN_SOLVES = 20;

export interface EconomySolve {
  id: string;
  date: number;
  /** Simplified (same-face turns merged) move count — STM. */
  moves: number;
}

/** One row per analyzable solve, oldest first. Pure — no replay beyond merging redundant same-face turns. */
export function economySolves(solves: readonly Solve[]): EconomySolve[] {
  return solves
    .filter((s) => s.penalty !== "dnf" && s.reconstruction)
    .map((s) => ({ id: s.id, date: s.date, moves: simplify(s.reconstruction!.split(/\s+/).filter(Boolean)).length }))
    .filter((s) => s.moves > 0)
    .sort((a, b) => a.date - b.date);
}

export interface EconomyReport {
  solves: number;
  curve: Curve;
  rolling: number[];
  series: number[];
  headline: string;
}

/** Fits Progress Forecast's own power-law curve to an already-extracted move-count series. Pure — testable without solves. */
export function summarizeEconomy(rows: readonly EconomySolve[]): EconomyReport | null {
  if (rows.length < MIN_SOLVES) return null;
  const series = rows.map((r) => r.moves);
  const curve = fitCurve(series, 1);
  const rolling = rollingMean(series);

  const parts: string[] = [
    curve.plateau
      ? `Your move count (${curve.current.toFixed(1)} turns/solve lately) has levelled off.`
      : `You're trimming about ${(curve.per100 * 100).toFixed(1)}% of your turns per 100 solves.`,
  ];
  const first10 = avg(series.slice(0, 10));
  const last10 = avg(series.slice(-10));
  if (first10 > 0 && (1 - last10 / first10) * 100 > 3) {
    parts.push(`Down from ${first10.toFixed(1)} turns/solve early on to ${last10.toFixed(1)} now.`);
  }

  return { solves: rows.length, curve, rolling, series, headline: parts.join(" ") };
}

export function buildEconomy(solves: readonly Solve[]): EconomyReport | null {
  return summarizeEconomy(economySolves(solves));
}
