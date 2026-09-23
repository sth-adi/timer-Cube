/**
 * Cross-solve insights mined straight from what a smart-cube capture already
 * stores on a `Solve` — `reconstruction` (move tokens), `moveTimestamps`
 * (real per-move elapsed ms) and `splits` (Cross/F2L/OLL cumulative ms, see
 * smartCubeStore.ts). Everything here is a pure, synchronous function over
 * data already on disk: no re-running the analyzer, no worker round-trip, no
 * "Build" button to wait on — these are as cheap as ConsistencyCard's own
 * stats and can render the instant a session has a couple of smart-cube
 * solves in it.
 */

import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { PAUSE_MS } from "@/lib/analytics/pause";

const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACE_LETTERS)[number];

function faceOf(token: string): Face | null {
  const upper = token[0]?.toUpperCase();
  return (FACE_LETTERS as readonly string[]).includes(upper) ? (upper as Face) : null;
}

export interface FaceSpeedStat {
  face: Face;
  /** Average time (ms) of this face's turns *within turning bursts* — pauses excluded. */
  avgGapMs: number;
  turnCount: number;
  /** How many times a pause (a look, not a turn) came right before this face's move — left out of avgGapMs. */
  pausesBefore: number;
}

/**
 * Per-face turn-speed fingerprint: which face is slowest *to turn*, averaged
 * across every smart-cube solve with real per-move timing. A move's cost is
 * the gap since the previous move — but only while you're turning. A gap of
 * PAUSE_MS or more is you looking for the next case or pair, and charging
 * that to whichever face you happened to turn next would make a face look
 * mechanically slow when the real cost was recognition. Those gaps are
 * counted separately (pausesBefore), as is the first move, whose gap runs
 * from the start of the timer.
 */
export function computeFaceSpeedFingerprint(solves: readonly Solve[]): FaceSpeedStat[] {
  const sums = new Map<Face, { totalMs: number; count: number; pauses: number }>();
  const entry = (face: Face) => {
    const e = sums.get(face) ?? { totalMs: 0, count: 0, pauses: 0 };
    sums.set(face, e);
    return e;
  };

  for (const solve of solves) {
    if (!solve.reconstruction || !solve.moveTimestamps) continue;
    const tokens = solve.reconstruction.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== solve.moveTimestamps.length) continue;

    for (let i = 1; i < tokens.length; i++) {
      const gap = solve.moveTimestamps[i] - solve.moveTimestamps[i - 1];
      const face = faceOf(tokens[i]);
      if (face === null || gap <= 0) continue;
      if (gap >= PAUSE_MS) {
        entry(face).pauses += 1;
        continue;
      }
      const e = entry(face);
      e.totalMs += gap;
      e.count += 1;
    }
  }

  return FACE_LETTERS.map((face) => {
    const e = sums.get(face);
    return { face, avgGapMs: e && e.count ? e.totalMs / e.count : 0, turnCount: e?.count ?? 0, pausesBefore: e?.pauses ?? 0 };
  }).filter((s) => s.turnCount > 0);
}

export interface LookaheadStat {
  /** Average pause (ms) right before the first move of F2L and PLL — the moment lookahead actually pays off. */
  avgPauseMs: number;
  sampleSize: number;
  /** One point per contributing solve, oldest first — for a trend sparkline. */
  perSolve: { date: number; pauseMs: number }[];
}

/**
 * How long you pause right as a phase ends before starting the next one —
 * i.e. how much recognition happens *during* the previous phase (good
 * lookahead: near zero) versus *after* it stops (bad lookahead: a visible
 * gap). Read directly off the move that lands right at each phase boundary
 * in `splits` and the very next move's real gap — no re-solving anything.
 */
export function computeLookaheadScore(solves: readonly Solve[]): LookaheadStat | null {
  const rows: { date: number; pauseMs: number }[] = [];

  for (const solve of solves) {
    if (!solve.splits || solve.splits.length < 3 || !solve.moveTimestamps) continue;
    const boundaries = [solve.splits[1], solve.splits[2]]; // F2L-end, OLL-end
    const mt = solve.moveTimestamps;
    const pauses: number[] = [];
    for (const boundary of boundaries) {
      // idx is the move that just finished this phase (its timestamp is the
      // boundary itself); the pause is the gap before the *next* move starts.
      const idx = mt.findIndex((t) => t >= boundary);
      if (idx >= 0 && idx + 1 < mt.length) pauses.push(mt[idx + 1] - mt[idx]);
    }
    if (pauses.length > 0) {
      rows.push({ date: solve.date, pauseMs: pauses.reduce((a, b) => a + b, 0) / pauses.length });
    }
  }

  if (rows.length === 0) return null;
  rows.sort((a, b) => a.date - b.date);
  const avgPauseMs = rows.reduce((a, r) => a + r.pauseMs, 0) / rows.length;
  return { avgPauseMs, sampleSize: rows.length, perSolve: rows };
}

export interface EfficiencyPoint {
  id: string;
  date: number;
  moveCount: number;
  timeMs: number;
  tps: number;
}

/**
 * One point per solved-and-reconstructed solve: how many moves it took
 * versus how long it took. Two solves with the same time can sit in very
 * different places here — one got there by moving less, the other by
 * turning faster — which is a distinction the single-number stats elsewhere
 * can't show. Move count is a raw token count (not STM), a fine proxy for
 * "how much work you did" without paying for a full re-solve.
 */
export function computeEfficiencyPoints(solves: readonly Solve[]): EfficiencyPoint[] {
  const points: EfficiencyPoint[] = [];
  for (const solve of solves) {
    if (!solve.reconstruction || solve.penalty === "dnf") continue;
    const tokens = solve.reconstruction.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const timeMs = solveFinalMs(solve);
    if (timeMs === null || timeMs <= 0) continue;
    points.push({ id: solve.id, date: solve.date, moveCount: tokens.length, timeMs, tps: tokens.length / (timeMs / 1000) });
  }
  return points;
}

export interface CoachTip {
  title: string;
  detail: string;
}

/**
 * One synthesized, actionable suggestion from whichever signal above is
 * standing out the most — a single sentence someone can act on today,
 * rather than a wall of stats to interpret themselves. Returns null when
 * there isn't enough smart-cube data yet to say anything meaningful.
 */
export function computeCoachTip(solves: readonly Solve[]): CoachTip | null {
  const lookahead = computeLookaheadScore(solves);
  const faces = computeFaceSpeedFingerprint(solves);
  const tips: CoachTip[] = [];

  if (lookahead && lookahead.sampleSize >= 3 && lookahead.avgPauseMs > 600) {
    tips.push({
      title: "Work on last-layer lookahead",
      detail: `You're averaging a ${(lookahead.avgPauseMs / 1000).toFixed(1)}s pause right as F2L and OLL finish, before the next phase's first move — try spotting the next case while finishing the current one instead of after.`,
    });
  }

  if (faces.length >= 2) {
    const bySpeed = [...faces].sort((a, b) => b.avgGapMs - a.avgGapMs);
    const slowest = bySpeed[0];
    const fastest = bySpeed[bySpeed.length - 1];
    if (slowest.turnCount >= 20 && fastest.turnCount >= 20 && fastest.avgGapMs > 0 && slowest.avgGapMs > fastest.avgGapMs * 1.4) {
      tips.push({
        title: `${slowest.face} turns are your slowest to execute`,
        detail: `Mid-flow (pauses to look left out), ${slowest.face} moves average ${Math.round(slowest.avgGapMs)}ms versus ${Math.round(fastest.avgGapMs)}ms for your fastest face (${fastest.face}) — a few minutes of ${slowest.face}-turn fingertricks on an empty cube should show up fast.`,
      });
    }
  }

  return tips[0] ?? null;
}
