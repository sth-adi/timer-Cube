import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import type { Solve } from "@/types";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";
import { CROSS_FACES, relabelMove, toCrossFrame, type CrossFace } from "@/lib/smartcube/crossFrame";
import { NO_MILESTONES, advanceMilestones, type Milestones } from "@/lib/smartcube/milestones";
import { buildPostSolveRows, type PostSolvePhaseRow } from "./postSolveTable";
import { extractAlgExecutions, type AlgExecution } from "@/lib/xray/algMicroscope";

/**
 * Everything the post-solve recap shows, rebuilt from a saved smart-cube
 * solve — so any past solve can be opened and read the way the one you've
 * just finished is. The milestones come from replaying the solve turn by
 * turn through exactly the logic the live timer runs (advanceMilestones),
 * so a past solve's breakdown is the one it had when you did it.
 */
export interface SolveBreakdown {
  crossFace: CrossFace;
  milestones: Milestones;
  /** The recap table's rows (times in ms from the first turn). */
  rows: PostSolvePhaseRow[];
  /** The solve's turns (real colours) with ms from the first turn. */
  moves: SmartCubeMove[];
  /** The same turns and scramble relabelled so the cross is on white — what the analyses read. */
  frameScramble: string;
  frameMoves: SmartCubeMove[];
  executions: AlgExecution[];
  totalMs: number;
}

/** Whether a saved solve carries what a breakdown needs: a scramble, turns, and a time for every turn. */
export function hasBreakdown(solve: Solve): boolean {
  if (!solve.scramble || !solve.reconstruction || !solve.moveTimestamps) return false;
  return solve.reconstruction.split(/\s+/).filter(Boolean).length === solve.moveTimestamps.length && solve.moveTimestamps.length > 0;
}

const cache = new WeakMap<Solve, SolveBreakdown | null>();

/** The breakdown of a saved solve (cached per solve object — a list of hundreds is only replayed once). */
export function solveBreakdown(solve: Solve): SolveBreakdown | null {
  if (cache.has(solve)) return cache.get(solve)!;
  const out = computeBreakdown(solve);
  cache.set(solve, out);
  return out;
}

function computeBreakdown(solve: Solve): SolveBreakdown | null {
  if (!hasBreakdown(solve)) return null;
  const tokens = solve.reconstruction!.split(/\s+/).filter(Boolean);
  const times = solve.moveTimestamps!;
  const scrambleTokens = solve.scramble.split(/\s+/).filter(Boolean);

  // The live timer's own state: the real cube plus a relabelled twin per colour.
  const live = newCube();
  if (scrambleTokens.length) live.move(scrambleTokens.join(" "));
  const frames = Object.fromEntries(
    CROSS_FACES.map((f) => {
      const c = newCube();
      const t = toCrossFrame(scrambleTokens, f);
      if (t.length) c.move(t.join(" "));
      return [f, c];
    }),
  ) as Record<CrossFace, CubeJSInstance>;

  let m = NO_MILESTONES;
  tokens.forEach((t, i) => {
    live.move(t);
    for (const f of CROSS_FACES) frames[f].move(relabelMove(t, f));
    m = advanceMilestones(m, live, (f) => frames[f], times[i]);
  });
  if (!live.isSolved()) return null;

  const crossFace = m.crossFace ?? "U";
  const moves = tokens.map((token, i) => ({ token, timeStampMs: times[i] }));
  const frameTokens = toCrossFrame(tokens, crossFace);
  const frameMoves = frameTokens.map((token, i) => ({ token, timeStampMs: times[i] }));
  const frameScramble = toCrossFrame(scrambleTokens, crossFace).join(" ");
  const totalMs = times[times.length - 1];
  const rows = buildPostSolveRows({
    moves,
    startedAtMs: times[0],
    crossAtMs: m.crossAtMs,
    f2lAtMs: m.f2lAtMs,
    f2lPairAtMs: m.f2lPairAtMs,
    ollAtMs: m.ollAtMs,
    solvedAtMs: totalMs,
    ollCaseName: m.ollCaseName,
    pllCaseName: m.pllCaseName,
  });
  let executions: AlgExecution[] = [];
  try {
    executions = extractAlgExecutions({ scramble: frameScramble, moves: frameTokens, timesMs: times, date: solve.date });
  } catch {
    executions = [];
  }
  return { crossFace, milestones: m, rows, moves, frameScramble, frameMoves, executions, totalMs };
}
