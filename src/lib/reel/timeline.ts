import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, f2lPairSolved, orientationSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, toLibraryFrame } from "@/lib/analysis/recognize";
import { HOME_ORIENTATION, viewerMove } from "@/lib/gyro/orientation";
import { crossSolved } from "@/lib/xray/common";

/**
 * Everything a Solve Reel frame needs, precomputed once per solve: the
 * cube's state after every move, when each move landed (and how long its
 * turn animation gets), the phase milestones with their case names, and the
 * moves in readable notation.
 */

export interface ReelPhase {
  label: string;
  /** Ms from solve start when this phase ended. */
  endMs: number;
  /** Duration of just this phase. */
  splitMs: number;
}

export interface ReelTimeline {
  scramble: string;
  /** facelets[k] = state after the first k moves (facelets[0] = scrambled). */
  facelets: string[];
  moves: string[];
  /** Moves in the yellow-top, green-front grip — how the cube is drawn. */
  display: string[];
  timesMs: number[];
  /** Turn-animation length for each move (bounded by the gap before it). */
  turnMs: number[];
  totalMs: number;
  phases: ReelPhase[];
}

/** No turn animates longer than this — fast solvers' turns are ~80-120ms. */
const MAX_TURN_MS = 110;

export function buildReelTimeline(scramble: string, moves: readonly string[], timesMs: readonly number[], totalMs?: number): ReelTimeline {
  const cube = newCube();
  if (scramble.trim()) cube.move(scramble);
  const facelets = [cube.asString()];
  const states: CubeJSInstance[] = [];
  for (const m of moves) {
    cube.move(m);
    facelets.push(cube.asString());
    states.push(cube.clone());
  }
  const times = moves.map((_, i) => timesMs[i] ?? 0);
  const turnMs = times.map((t, i) => Math.max(40, Math.min(MAX_TURN_MS, i === 0 ? MAX_TURN_MS : t - times[i - 1])));
  const end = totalMs ?? times[times.length - 1] ?? 0;

  // Phase milestones: cross, each new pair (with the cross intact), OLL, PLL.
  const phases: ReelPhase[] = [];
  const push = (label: string, idx: number) => {
    const endMs = times[idx] ?? end;
    const prev = phases[phases.length - 1]?.endMs ?? 0;
    phases.push({ label, endMs, splitMs: endMs - prev });
  };
  const crossIdx = states.findIndex(crossSolved);
  if (crossIdx >= 0) {
    push("Cross", crossIdx);
    let best = [0, 1, 2, 3].filter((p) => f2lPairSolved(states[crossIdx], p as 0 | 1 | 2 | 3)).length;
    let f2lIdx = -1;
    for (let i = crossIdx + 1; i < states.length; i++) {
      if (!crossSolved(states[i])) continue;
      const n = [0, 1, 2, 3].filter((p) => f2lPairSolved(states[i], p as 0 | 1 | 2 | 3)).length;
      while (n > best) {
        best++;
        push(`F2L ${best}`, i);
      }
      if (bottomLayerSolved(states[i])) {
        f2lIdx = i;
        break;
      }
    }
    if (f2lIdx >= 0) {
      const ollIdx = states.findIndex((s, i) => i >= f2lIdx && bottomLayerSolved(s) && orientationSolved(s));
      const ollName = ollIdx > f2lIdx ? (recognizeOll(toLibraryFrame(states[f2lIdx]))?.case.name ?? "OLL") : "OLL skip";
      if (ollIdx >= 0) {
        push(ollIdx > f2lIdx ? `OLL · ${ollName}` : "OLL skip", ollIdx);
        const solvedIdx = states.length - 1;
        if (states[solvedIdx].isSolved()) {
          const pllName = recognizePll(toLibraryFrame(states[ollIdx]))?.case.name;
          phases.push({ label: pllName ? `PLL · ${pllName}` : "PLL", endMs: end, splitMs: end - (phases[phases.length - 1]?.endMs ?? 0) });
        }
      }
    }
  }

  return {
    scramble,
    facelets,
    moves: [...moves],
    display: moves.map((m) => viewerMove(m, HOME_ORIENTATION)),
    timesMs: times,
    turnMs,
    totalMs: end,
    phases,
  };
}

export interface ReelFrame {
  /** Moves fully done by `t`. */
  done: number;
  /** The move currently turning, if any, and how far through it is. */
  turning: { index: number; progress: number } | null;
  /** Index of the phase in progress (== phases.length once finished). */
  phaseIndex: number;
}

/** Where the solve is at `t` ms after its start. */
export function frameAt(tl: ReelTimeline, t: number): ReelFrame {
  let done = 0;
  while (done < tl.timesMs.length && tl.timesMs[done] <= t) done++;
  let turning: ReelFrame["turning"] = null;
  if (done < tl.timesMs.length) {
    const startsAt = tl.timesMs[done] - tl.turnMs[done];
    if (t > startsAt) turning = { index: done, progress: (t - startsAt) / tl.turnMs[done] };
  }
  let phaseIndex = 0;
  while (phaseIndex < tl.phases.length && tl.phases[phaseIndex].endMs <= t) phaseIndex++;
  return { done, turning, phaseIndex };
}

/** Turns per second over the second leading up to `t`. */
export function rollingTps(tl: ReelTimeline, t: number): number {
  return tl.timesMs.filter((m) => m <= t && m > t - 1000).length;
}
