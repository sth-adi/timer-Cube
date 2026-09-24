import type { Solve } from "@/types";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { computeFaceSpeedFingerprint, type Face, type FaceSpeedStat } from "@/lib/analysis/smartCubeInsights";

/**
 * Spin: two bias questions the per-face fingerprint (smartCubeInsights.ts)
 * doesn't ask, because it folds every direction of a face together.
 *
 *   1. Clockwise vs counter-clockwise — is R faster than R', averaged over
 *      every face, or do you favour one twist direction generally?
 *   2. Opposite-face pairs — U vs D, R vs L, F vs B: which side of each
 *      axis is the one costing you more time per turn?
 *
 * Same convention as the face fingerprint: a move's cost is the gap since
 * the previous move, counted only inside a turning burst (< PAUSE_MS), with
 * the very first move of a solve skipped (its gap runs from the timer
 * start, not from a previous turn).
 */

export type Direction = "cw" | "ccw";

export interface DirectionStat {
  direction: Direction;
  avgGapMs: number;
  turnCount: number;
}

/** Quarter turns only — a half turn (R2) has no clockwise/counter-clockwise sense. */
function directionOf(token: string): Direction | null {
  if (token.length < 1 || token.includes("2")) return null;
  return token.endsWith("'") ? "ccw" : "cw";
}

export function computeDirectionBias(solves: readonly Solve[]): DirectionStat[] {
  const sums = new Map<Direction, { totalMs: number; count: number }>();

  for (const solve of solves) {
    if (!solve.reconstruction || !solve.moveTimestamps) continue;
    const tokens = solve.reconstruction.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== solve.moveTimestamps.length) continue;

    for (let i = 1; i < tokens.length; i++) {
      const gap = solve.moveTimestamps[i] - solve.moveTimestamps[i - 1];
      const dir = directionOf(tokens[i]);
      if (dir === null || gap <= 0 || gap >= PAUSE_MS) continue;
      const entry = sums.get(dir) ?? { totalMs: 0, count: 0 };
      entry.totalMs += gap;
      entry.count += 1;
      sums.set(dir, entry);
    }
  }

  return (["cw", "ccw"] as const)
    .map((direction) => {
      const entry = sums.get(direction);
      return { direction, avgGapMs: entry ? entry.totalMs / entry.count : 0, turnCount: entry?.count ?? 0 };
    })
    .filter((s) => s.turnCount > 0);
}

const AXES: readonly { name: "UD" | "RL" | "FB"; faces: readonly [Face, Face] }[] = [
  { name: "UD", faces: ["U", "D"] },
  { name: "RL", faces: ["R", "L"] },
  { name: "FB", faces: ["F", "B"] },
];

export interface AxisBias {
  axis: "UD" | "RL" | "FB";
  faces: readonly [Face, Face];
  /** The slower of the two faces. */
  slowerFace: Face;
  fasterFace: Face;
  diffMs: number;
  slowerAvgMs: number;
  fasterAvgMs: number;
}

/** Fewest turns on *each* face of a pair before comparing them means anything — same bar the face-speed coach tip uses. */
export const MIN_TURNS_PER_FACE = 20;

/** Derives the three opposite-face-pair comparisons from the existing per-face fingerprint, so face timing logic lives in exactly one place. */
export function computeAxisBias(faceStats: readonly FaceSpeedStat[]): AxisBias[] {
  const byFace = new Map(faceStats.map((f) => [f.face, f]));
  const axes: AxisBias[] = [];
  for (const { name, faces } of AXES) {
    const [a, b] = faces.map((f) => byFace.get(f));
    if (!a || !b || a.turnCount < MIN_TURNS_PER_FACE || b.turnCount < MIN_TURNS_PER_FACE) continue;
    const [slower, faster] = a.avgGapMs >= b.avgGapMs ? [a, b] : [b, a];
    axes.push({ axis: name, faces, slowerFace: slower.face, fasterFace: faster.face, diffMs: slower.avgGapMs - faster.avgGapMs, slowerAvgMs: slower.avgGapMs, fasterAvgMs: faster.avgGapMs });
  }
  return axes;
}

export interface SpinReport {
  directions: DirectionStat[];
  /** ccw avg - cw avg; positive means counter-clockwise turns are slower. */
  directionBiasMs: number;
  axes: AxisBias[];
  headline: string;
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

export function computeSpinReport(solves: readonly Solve[]): SpinReport | null {
  const directions = computeDirectionBias(solves);
  const faceStats = computeFaceSpeedFingerprint(solves);
  const axes = computeAxisBias(faceStats);
  if (directions.length < 2 && axes.length === 0) return null;

  const cw = directions.find((d) => d.direction === "cw");
  const ccw = directions.find((d) => d.direction === "ccw");
  const directionBiasMs = cw && ccw ? ccw.avgGapMs - cw.avgGapMs : 0;

  const parts: string[] = [];
  if (cw && ccw && Math.abs(directionBiasMs) >= 15) {
    const slow = directionBiasMs > 0 ? "counter-clockwise" : "clockwise";
    parts.push(`Your ${slow} turns average ${secs(Math.abs(directionBiasMs))}s slower per turn than the other direction.`);
  } else if (cw && ccw) {
    parts.push("Clockwise and counter-clockwise turns cost about the same.");
  }
  const worstAxis = [...axes].sort((a, b) => b.diffMs - a.diffMs)[0];
  if (worstAxis && worstAxis.diffMs >= 15) {
    parts.push(`${worstAxis.slowerFace} is your slowest side of the ${worstAxis.faces.join("/")} axis — ${secs(worstAxis.diffMs)}s/turn behind ${worstAxis.fasterFace}.`);
  }
  if (parts.length === 0) parts.push("No real bias either in turn direction or between opposite faces — your turning is symmetric.");

  return { directions, directionBiasMs, axes, headline: parts.join(" ") };
}
