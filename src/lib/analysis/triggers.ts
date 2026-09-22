import type { Solve } from "@/types";

/** All 18 single-face quarter/half turns, ordered face-by-face for a stable, readable grid layout. */
export const FACE_TURNS = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"] as const;

export interface TriggerStat {
  pair: string;
  first: string;
  second: string;
  count: number;
  avgMs: number;
}

/** Below this many occurrences a pair's average is too noisy (one slow outlier dominates it) to call a real pattern. */
const MIN_OCCURRENCES = 3;
/**
 * A gap this long is a thinking pause (recognizing the next case, planning
 * an AUF), not the two-move "trigger" itself taking that long to turn — the
 * point of this stat is finger-trick execution speed, so pauses like that
 * would otherwise make an unrelated pair of moves look like a slow trigger
 * purely because of what happened between them.
 */
const MAX_PLAUSIBLE_GAP_MS = 2000;

/**
 * Move-pair ("trigger") execution speed, aggregated across every solve that
 * carries real per-move timestamps — only smart-cube captures qualify (see
 * Solve.moveTimestamps), since a keyboard-timed solve has no per-move data
 * to draw this from at all. This is a much more granular lens than the
 * existing phase-level stats: two solves can have identical OLL time totals
 * while one of them is dragging on one specific finger trick the whole way.
 */
export function computeTriggerStats(solves: Solve[]): TriggerStat[] {
  const agg = new Map<string, { first: string; second: string; count: number; totalMs: number }>();

  for (const solve of solves) {
    if (!solve.reconstruction || !solve.moveTimestamps) continue;
    const tokens = solve.reconstruction.trim().split(/\s+/).filter(Boolean);
    const ts = solve.moveTimestamps;
    if (tokens.length !== ts.length || tokens.length < 2) continue;

    for (let i = 0; i < tokens.length - 1; i++) {
      const gap = ts[i + 1] - ts[i];
      if (!Number.isFinite(gap) || gap < 0 || gap > MAX_PLAUSIBLE_GAP_MS) continue;
      const first = tokens[i];
      const second = tokens[i + 1];
      const key = `${first} ${second}`;
      const existing = agg.get(key);
      if (existing) {
        existing.count++;
        existing.totalMs += gap;
      } else {
        agg.set(key, { first, second, count: 1, totalMs: gap });
      }
    }
  }

  const out: TriggerStat[] = [];
  for (const [pair, v] of agg) {
    if (v.count < MIN_OCCURRENCES) continue;
    out.push({ pair, first: v.first, second: v.second, count: v.count, avgMs: v.totalMs / v.count });
  }
  return out;
}
