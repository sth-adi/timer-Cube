import type { Solve } from "@/types";
import { solveBreakdown } from "./solveBreakdown";

/**
 * How an exact OLL/PLL case has gone across every smart-cube solve with a
 * breakdown — by the case itself, not by which algorithm solved it (two
 * solves of the same case can use two different algs; this is what the
 * per-algorithm "your alg" stat in PostSolveTable doesn't capture).
 */
export interface CaseRecord {
  /** How many times this case has been executed (skips don't count — there's nothing to have a time on). */
  count: number;
  meanMs: number;
  bestMs: number;
}

/** Aggregates every OLL/PLL case's execution time across `solves`. */
export function caseRecords(solves: readonly Solve[]): Map<string, CaseRecord> {
  const totals = new Map<string, { sum: number; best: number; count: number }>();
  for (const solve of solves) {
    const b = solveBreakdown(solve);
    if (!b) continue;
    for (const row of b.rows) {
      if (row.label !== "OLL" && row.label !== "PLL") continue;
      if (!row.caseName || row.caseName.toLowerCase().includes("skip")) continue;
      if (row.totalMs === null || row.totalMs <= 0) continue;
      const cur = totals.get(row.caseName) ?? { sum: 0, best: Infinity, count: 0 };
      cur.sum += row.totalMs;
      cur.best = Math.min(cur.best, row.totalMs);
      cur.count += 1;
      totals.set(row.caseName, cur);
    }
  }
  const out = new Map<string, CaseRecord>();
  for (const [name, v] of totals) out.set(name, { count: v.count, meanMs: v.sum / v.count, bestMs: v.best });
  return out;
}
