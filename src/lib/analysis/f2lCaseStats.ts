import type { Solve } from "@/types";
import { Cube } from "@/lib/cube-engine/engine";
import { recognizeF2lCase } from "./f2lCase";
import { solveBreakdown } from "./solveBreakdown";

/**
 * How many turns an F2L case has actually taken you, across every smart-cube
 * solve with a breakdown — not a computer's absolute minimum (which a
 * one-look human rarely matches anyway), but *your own* usual count for this
 * exact case, so "7 turns" reads against something you can act on: your own
 * best is proof a shorter insert was findable from there.
 */
export interface F2lCaseStat {
  count: number;
  meanTurns: number;
  bestTurns: number;
}

/** Aggregates every F2L case's turn count across `solves`, keyed by the case's own stable identity. */
export function f2lCaseStats(solves: readonly Solve[]): Map<string, F2lCaseStat> {
  const totals = new Map<string, { sum: number; best: number; count: number }>();
  for (const solve of solves) {
    const b = solveBreakdown(solve);
    if (!b) continue;
    for (const row of b.rows) {
      if (row.f2lPairIndex === null || row.startMs === null || row.atMs === null) continue;
      const cube = new Cube();
      const before = b.frameMoves.filter((m) => m.timeStampMs <= row.startMs!).map((m) => m.token);
      const alg = [b.frameScramble, ...before].join(" ").trim();
      if (alg) cube.move(alg);
      const f2l = recognizeF2lCase(cube, row.f2lPairIndex);
      if (!f2l) continue;
      const turns = b.frameMoves.filter((m) => m.timeStampMs > row.startMs! && m.timeStampMs <= row.atMs!).length;
      if (turns <= 0) continue;
      const cur = totals.get(f2l.key) ?? { sum: 0, best: Infinity, count: 0 };
      cur.sum += turns;
      cur.best = Math.min(cur.best, turns);
      cur.count += 1;
      totals.set(f2l.key, cur);
    }
  }
  const out = new Map<string, F2lCaseStat>();
  for (const [key, v] of totals) out.set(key, { count: v.count, meanTurns: v.sum / v.count, bestTurns: v.best });
  return out;
}
