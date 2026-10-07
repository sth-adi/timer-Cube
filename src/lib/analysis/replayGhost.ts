import { ghostFromSolve, type Ghost } from "@/lib/rematch/ghost";
import { solveFinalMs, type EventTag, type Solve } from "@/types";
import { gapsFromTimestamps } from "./replayGaps";
import { activeLeaf, buildTimeline, type ReplayTimeline } from "./replayTiming";

/**
 * The faint second cube in a replay: your best earlier smart-cube solve (the Ghost Race's own
 * `ghostFromSolve`), or a model solution when there is none, turning beside yours at the same
 * elapsed time. This is the data side; the drawing is components/analysis/ReplayGhostTwin.
 */

/** What the solve being replayed is, so it is never its own ghost. */
export interface GhostTarget {
  id?: string;
  scramble: string;
  timeMs: number;
  /** When it was solved: with it, only solves from before then can be the ghost. */
  date?: number;
  event?: EventTag;
}

const moveCount = (reconstruction: string) => reconstruction.trim().split(/\s+/).filter(Boolean).length;

/**
 * Your fastest earlier solve that has recorded moves and a time for every one of them, in the same
 * event, and is not the solve itself. Null when there is none.
 */
export function pickGhostSolve(solves: readonly Solve[], target: GhostTarget): Solve | null {
  let best: Solve | null = null;
  let bestMs = Infinity;
  for (const s of solves) {
    if (s.id === target.id) continue;
    if (!s.scramble || !s.reconstruction || !s.moveTimestamps || s.moveTimestamps.length === 0) continue;
    if (s.moveTimestamps.length !== moveCount(s.reconstruction)) continue;
    if (s.event !== target.event) continue;
    if (target.date !== undefined && s.date >= target.date) continue;
    // Without an id the solve can only be recognised by what it is.
    if (target.id === undefined && s.scramble === target.scramble && s.timeMs === target.timeMs) continue;
    const ms = solveFinalMs(s);
    if (ms === null || ms >= bestMs) continue;
    best = s;
    bestMs = ms;
  }
  return best;
}

/** The ghost from a picked solve, with the short caption the twin carries. */
export function pbGhost(solve: Solve, targetMs: number): { ghost: Ghost; label: string } {
  const ms = solveFinalMs(solve) ?? solve.timeMs;
  const label = `${ms < targetMs ? "PB" : "Earlier best"} ${(ms / 1000).toFixed(2)}`;
  return { ghost: ghostFromSolve(solve), label };
}

/**
 * A model solution as a ghost: `moves` (a solver's answer for `scramble`) turned at the pace of the
 * solve it is shown against, `userMoves` turns over `userMs`, so the length of the solution is the
 * only difference. Null for an empty solution or a solve with no time.
 */
export function modelGhost(scramble: string, moves: readonly string[], userMoves: number, userMs: number): Ghost | null {
  if (moves.length === 0 || userMoves <= 0 || !(userMs > 0)) return null;
  const per = Math.max(110, userMs / userMoves);
  const timesMs = moves.map((_, i) => Math.round((i + 1) * per));
  return {
    source: "pasted",
    label: "Model solution",
    scramble,
    moves: [...moves],
    timesMs,
    totalMs: timesMs[timesMs.length - 1],
    evenlyPaced: true,
  };
}

/** The ghost's turns laid on a clock that starts with its first move, true timing, turns of `turnMs` (as the replay's own). */
export function ghostTimeline(ghost: Ghost, turnMs: number): ReplayTimeline {
  return buildTimeline(gapsFromTimestamps(ghost.timesMs), { realPauses: true, turnMs });
}

export interface GhostFrame {
  /** Moves completely made. */
  done: number;
  /** The move being turned, and how far round it is (0..1). */
  turning: { index: number; progress: number } | null;
  /** Every move made. */
  finished: boolean;
}

/** Where the ghost is `posMs` into its solve. */
export function ghostFrameAt(timeline: ReplayTimeline, posMs: number): GhostFrame {
  const n = timeline.starts.length;
  const k = n ? activeLeaf(timeline.starts, posMs) : -1;
  if (k < 0) return { done: 0, turning: null, finished: n === 0 };
  const span = timeline.ends[k] - timeline.starts[k];
  if (posMs < timeline.ends[k] && span > 0) {
    return { done: k, turning: { index: k, progress: Math.max(0, (posMs - timeline.starts[k]) / span) }, finished: false };
  }
  return { done: k + 1, turning: null, finished: k + 1 >= n && posMs >= timeline.ends[n - 1] };
}
