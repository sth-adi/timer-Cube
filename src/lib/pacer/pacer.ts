import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { crossSolved, median, replayStates, type XraySolveInput } from "@/lib/xray/common";
import { crossFaceOf, toCrossFrame } from "@/lib/smartcube/crossFrame";

/**
 * Split Pacer: a running coach's pace calls, for a solve. Pick a target
 * time; from your own history the pacer learns how *you* divide a solve
 * (your cross share, how your pairs are spaced, how long your last layer
 * takes) and scales that shape to the target. During the solve, every
 * milestone the cube reports — cross, each pair, OLL — plays a tone that
 * says ahead or behind, so you feel the pace without looking at anything.
 */

export const MILESTONES = ["Cross", "Pair 1", "Pair 2", "Pair 3", "F2L", "OLL", "Solved"] as const;
export type Milestone = (typeof MILESTONES)[number];

/** A typical CFOP solve's shape (share of the total at each milestone) — used until there's enough history. */
export const DEFAULT_SHAPE: readonly number[] = [0.13, 0.26, 0.38, 0.5, 0.62, 0.8, 1];
/** Solves with every milestone needed before the pacer trusts your own shape. */
export const MIN_HISTORY = 5;
/** Within this much of the target counts as on pace. */
export const ON_PACE_MS = 150;

const countPairs = (c: Parameters<typeof f2lPairSolved>[0]) => [0, 1, 2, 3].filter((i) => f2lPairSolved(c, i as 0 | 1 | 2 | 3)).length;

/** Ms from solve start at which each milestone was first reached, or null if it never was. Any cross colour (see crossFrame.ts). */
export function milestoneTimes({ scramble, moves, timesMs }: XraySolveInput): (number | null)[] {
  const out: (number | null)[] = MILESTONES.map(() => null);
  if (moves.length === 0 || timesMs.length !== moves.length) return out;
  const face = crossFaceOf(scramble, moves) ?? "U";
  const { after } = replayStates(toCrossFrame(scramble.split(/\s+/).filter(Boolean), face).join(" "), toCrossFrame(moves, face));
  let pairs = 0;
  for (let i = 0; i < after.length; i++) {
    const c = after[i];
    const t = timesMs[i];
    if (!crossSolved(c)) continue;
    if (out[0] === null) out[0] = t;
    const n = countPairs(c);
    for (let k = pairs + 1; k <= n; k++) out[k] = t; // Pair 1..3 are indices 1..3, the fourth pair is F2L (4)
    pairs = Math.max(pairs, n);
    if (out[5] === null && pairs === 4 && bottomLayerSolved(c) && orientationSolved(c)) out[5] = t;
  }
  if (after[after.length - 1].isSolved()) out[6] = timesMs[timesMs.length - 1];
  return out;
}

/**
 * Your personal shape: the median share of the total at each milestone
 * across your complete solves, forced non-decreasing. Falls back to the
 * typical CFOP shape until there are enough.
 */
export function personalShape(history: readonly (number | null)[][]): { shape: number[]; personal: boolean; solves: number } {
  const complete = history.filter((h) => h.every((t) => t !== null) && h[6]! > 0) as number[][];
  if (complete.length < MIN_HISTORY) return { shape: [...DEFAULT_SHAPE], personal: false, solves: complete.length };
  const shape = MILESTONES.map((_, k) => median(complete.map((h) => h[k] / h[6]))!);
  for (let k = 1; k < shape.length; k++) shape[k] = Math.max(shape[k], shape[k - 1]);
  shape[6] = 1;
  return { shape, personal: true, solves: complete.length };
}

export const targetSplits = (targetMs: number, shape: readonly number[]) => shape.map((f) => Math.round(f * targetMs));

export type PaceVerdict = "ahead" | "on" | "behind";

export function paceVerdict(deltaMs: number): PaceVerdict {
  return deltaMs < -ON_PACE_MS ? "ahead" : deltaMs > ON_PACE_MS ? "behind" : "on";
}

export interface PaceRow {
  milestone: Milestone;
  targetMs: number;
  actualMs: number | null;
  /** Actual − target at this milestone (negative = ahead). */
  deltaMs: number | null;
  /** Time this stretch took minus its target (negative = gained here). */
  segmentDeltaMs: number | null;
}

export interface PaceLadder {
  rows: PaceRow[];
  /** The stretch that lost the most time against target — null if none lost any. */
  worst: PaceRow | null;
  /** The stretch that gained the most. */
  best: PaceRow | null;
}

export function paceLadder(actual: readonly (number | null)[], targets: readonly number[]): PaceLadder {
  const rows: PaceRow[] = MILESTONES.map((milestone, k) => {
    const a = actual[k];
    const prevActual = k === 0 ? 0 : actual[k - 1];
    const prevTarget = k === 0 ? 0 : targets[k - 1];
    return {
      milestone,
      targetMs: targets[k],
      actualMs: a,
      deltaMs: a === null ? null : a - targets[k],
      segmentDeltaMs: a === null || prevActual === null ? null : a - prevActual - (targets[k] - prevTarget),
    };
  });
  const withSeg = rows.filter((r) => r.segmentDeltaMs !== null);
  const worst = withSeg.reduce<PaceRow | null>((w, r) => (r.segmentDeltaMs! > 0 && (!w || r.segmentDeltaMs! > w.segmentDeltaMs!) ? r : w), null);
  const best = withSeg.reduce<PaceRow | null>((b, r) => (r.segmentDeltaMs! < 0 && (!b || r.segmentDeltaMs! < b.segmentDeltaMs!) ? r : b), null);
  return { rows, worst, best };
}

/**
 * Live milestones from what the smart-cube store tracks during a solve
 * (absolute timestamps), in MILESTONES order, relative to the start.
 */
export function liveMilestones(s: {
  startedAtMs: number | null;
  crossAtMs: number | null;
  f2lPairAtMs: readonly (number | null)[];
  f2lAtMs: number | null;
  ollAtMs: number | null;
  solvedAtMs: number | null;
}): (number | null)[] {
  if (s.startedAtMs === null) return MILESTONES.map(() => null);
  const rel = (t: number | null) => (t === null ? null : t - s.startedAtMs!);
  const cross = rel(s.crossAtMs);
  // A pair can go in before the cross is finished; it only counts from the cross on.
  const pairs = s.f2lPairAtMs
    .filter((t): t is number => t !== null)
    .map((t) => Math.max(t - s.startedAtMs!, cross ?? Infinity))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  return [cross, pairs[0] ?? null, pairs[1] ?? null, pairs[2] ?? null, rel(s.f2lAtMs) ?? pairs[3] ?? null, rel(s.ollAtMs), rel(s.solvedAtMs)];
}
