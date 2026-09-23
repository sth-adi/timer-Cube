import { SEGMENTS, quantile, type SolveMetrics } from "./solveMetrics";

/**
 * Sum of Best — the speedrunner's number, for cubing. Every solve is seven
 * stretches (cross, four pairs, OLL, PLL); your best-ever time on each,
 * added up, is a solve you have already proven you can do, just never all
 * at once. The gap between each stretch's typical time and its best is
 * where the time is; a "gold" is a stretch that beat every earlier attempt.
 *
 * Skipped OLLs and PLLs are luck, not a best you earned, so by default
 * they don't count toward the OLL/PLL bests.
 */

export interface SegmentBest {
  label: string;
  bestMs: number;
  bestDate: number;
  medianMs: number;
  /** Median − best: what that stretch could still give back. */
  possibleSaveMs: number;
  golds: number;
  lastGoldDate: number;
}

export interface SumOfBestReport {
  solves: number;
  sumOfBestMs: number;
  pbMs: number;
  /** PB minus sum of best. */
  headroomMs: number;
  segments: SegmentBest[];
  /** Gold stretches per solve, oldest first. */
  goldsPerSolve: number[];
  lastGold: { label: string; date: number } | null;
  headline: string;
}

export const MIN_SOLVES = 5;

export function buildSumOfBest(metrics: readonly SolveMetrics[], countSkips = false): SumOfBestReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const ordered = [...metrics].sort((a, b) => a.date - b.date);
  const eligible = (m: SolveMetrics, k: number) => countSkips || !((k === 5 && m.ollSkip) || (k === 6 && m.pllSkip));

  const best: { ms: number; date: number; golds: number; lastGold: number }[] = SEGMENTS.map(() => ({ ms: Infinity, date: 0, golds: 0, lastGold: 0 }));
  const goldsPerSolve: number[] = [];
  let lastGold: { label: string; date: number } | null = null;
  for (const m of ordered) {
    let golds = 0;
    SEGMENTS.forEach((label, k) => {
      if (!eligible(m, k)) return;
      const v = m.segments[k];
      if (v < best[k].ms) {
        // The first attempt at a stretch sets the bar; it isn't a gold.
        if (best[k].ms !== Infinity) {
          golds++;
          best[k].golds++;
          best[k].lastGold = m.date;
          lastGold = { label, date: m.date };
        }
        best[k].ms = v;
        best[k].date = m.date;
      }
    });
    goldsPerSolve.push(golds);
  }

  const segments: SegmentBest[] = SEGMENTS.map((label, k) => {
    const values = ordered.filter((m) => eligible(m, k)).map((m) => m.segments[k]);
    const medianMs = quantile(values, 0.5);
    const bestMs = Number.isFinite(best[k].ms) ? best[k].ms : medianMs;
    return {
      label,
      bestMs,
      bestDate: best[k].date,
      medianMs,
      possibleSaveMs: Math.max(0, medianMs - bestMs),
      golds: best[k].golds,
      lastGoldDate: best[k].lastGold,
    };
  });

  const sumOfBestMs = segments.reduce((a, s) => a + s.bestMs, 0);
  const pbMs = Math.min(...ordered.map((m) => m.totalMs));
  const top = [...segments].sort((a, b) => b.possibleSaveMs - a.possibleSaveMs)[0];
  const headline =
    `Your best-ever stretches add up to ${(sumOfBestMs / 1000).toFixed(2)}s — ${((pbMs - sumOfBestMs) / 1000).toFixed(2)}s under your ${(pbMs / 1000).toFixed(2)}s PB. ` +
    `The most time is waiting in ${top.label}: you typically take ${(top.medianMs / 1000).toFixed(2)}s, but you've done it in ${(top.bestMs / 1000).toFixed(2)}s.`;

  return { solves: ordered.length, sumOfBestMs, pbMs, headroomMs: pbMs - sumOfBestMs, segments, goldsPerSolve, lastGold, headline };
}
