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

const turnsCache = new WeakMap<Solve, { key: string; turns: number }[]>();

/**
 * Each of one solve's recognised F2L pairs with the turns it took — cached
 * per solve object, since recognising a pair means replaying the solve up to
 * it. The returned array is shared: treat it as read-only.
 */
export function solveF2lTurns(solve: Solve): { key: string; turns: number }[] {
  const hit = turnsCache.get(solve);
  if (hit) return hit;
  const out = computeF2lTurns(solve);
  turnsCache.set(solve, out);
  return out;
}

function computeF2lTurns(solve: Solve): { key: string; turns: number }[] {
  const out: { key: string; turns: number }[] = [];
  const b = solveBreakdown(solve);
  if (!b) return out;
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
    out.push({ key: f2l.key, turns });
  }
  return out;
}

/** Aggregates every F2L case's turn count across `solves`, keyed by the case's own stable identity. */
export function f2lCaseStats(solves: readonly Solve[]): Map<string, F2lCaseStat> {
  const totals = new Map<string, { sum: number; best: number; count: number }>();
  for (const solve of solves) {
    for (const { key, turns } of solveF2lTurns(solve)) {
      const cur = totals.get(key) ?? { sum: 0, best: Infinity, count: 0 };
      cur.sum += turns;
      cur.best = Math.min(cur.best, turns);
      cur.count += 1;
      totals.set(key, cur);
    }
  }
  const out = new Map<string, F2lCaseStat>();
  for (const [key, v] of totals) out.set(key, { count: v.count, meanTurns: v.sum / v.count, bestTurns: v.best });
  return out;
}
