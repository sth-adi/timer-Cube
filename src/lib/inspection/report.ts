import { newCube } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { crossSolved, mean } from "@/lib/xray/common";

/**
 * Inspection Report Card. Fifteen seconds of inspection leave no trace on a
 * stopwatch — but they leave a very clear one in a smart cube's move
 * stream. A cross you planned all the way through comes out as one
 * unbroken burst of turns; one you only half-planned has a tell-tale pause
 * in the middle where you went looking for the last edge. From each solve
 * this reads:
 *
 *  - **planned depth** — how many cross turns you made before the first
 *    thinking pause, against how many the cross took;
 *  - **efficiency** — your cross against the shortest one on that scramble;
 *  - **x-cross** — whether you built an F2L pair into the cross;
 *  - **pauses** — how often you stopped mid-cross;
 *
 * and grades the inspection A–F.
 */

/** A gap this long mid-cross is you stopping to look, not just a slow turn. */
export const THINK_PAUSE_MS = 350;

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface InspectionReport {
  /** Turns you used for the cross. */
  crossTurns: number;
  /** Shortest possible cross on this scramble. */
  optimalTurns: number;
  /** Turns made before the first thinking pause (capped at crossTurns). */
  plannedTurns: number;
  /** plannedTurns / crossTurns. */
  plannedFraction: number;
  /** Thinking pauses inside the cross. */
  pauses: number;
  /** A pair built together with the cross (not one already solved in the scramble). */
  xcross: boolean;
  crossMs: number;
  score: number;
  grade: Grade;
  notes: string[];
}

export function gradeFor(score: number): Grade {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
}

export function inspectionReport(scramble: string, moves: readonly string[], timesMs: readonly number[]): InspectionReport | null {
  const start = newCube();
  if (scramble.trim()) start.move(scramble);
  const optimalTurns = crossHeuristic(start);
  const cube = start.clone();
  let crossIdx = -1;
  for (let i = 0; i < moves.length; i++) {
    cube.move(moves[i]);
    if (crossSolved(cube)) {
      crossIdx = i;
      break;
    }
  }
  if (crossIdx < 0 && optimalTurns > 0) return null;
  const crossTurns = crossIdx + 1;
  const t = (i: number) => timesMs[i] ?? 0;

  let plannedTurns = crossTurns;
  let pauses = 0;
  for (let i = 1; i <= crossIdx; i++) {
    if (t(i) - t(i - 1) >= THINK_PAUSE_MS) {
      if (pauses === 0) plannedTurns = i;
      pauses++;
    }
  }
  const plannedFraction = crossTurns > 0 ? plannedTurns / crossTurns : 1;
  const xcross =
    crossIdx >= 0 && [0, 1, 2, 3].some((p) => f2lPairSolved(cube, p as 0 | 1 | 2 | 3) && !f2lPairSolved(start, p as 0 | 1 | 2 | 3));
  const efficiency = crossTurns > 0 ? Math.min(1, optimalTurns / crossTurns) : 1;

  const score = Math.round(Math.min(100, 45 * plannedFraction + 30 * efficiency + (pauses === 0 ? 15 : pauses === 1 ? 6 : 0) + (xcross ? 10 : 0)));
  const notes: string[] = [];
  if (pauses === 0) notes.push(`Whole cross in one burst — fully planned.`);
  else notes.push(`Planned ${plannedTurns} of ${crossTurns} cross turns, then paused ${pauses === 1 ? "once" : `${pauses} times`} to find the rest.`);
  if (crossTurns > optimalTurns + 1) notes.push(`${crossTurns} turns where ${optimalTurns} were enough — look for a shorter cross in inspection.`);
  else if (crossTurns > 0) notes.push(crossTurns <= optimalTurns ? "Optimal cross." : "Within a turn of optimal.");
  if (xcross) notes.push("X-cross: you built a pair into it.");

  return { crossTurns, optimalTurns, plannedTurns, plannedFraction, pauses, xcross, crossMs: crossIdx >= 0 ? t(crossIdx) : 0, score, grade: gradeFor(score), notes };
}

export interface InspectionHistory {
  solves: number;
  avgScore: number;
  grade: Grade;
  /** Share of crosses done in one unbroken burst. */
  fullyPlannedRate: number;
  avgPlannedFraction: number;
  avgExtraTurns: number;
  xcrossRate: number;
  /** Mean score of the newer half minus the older half — positive is improving. */
  trend: number | null;
}

/** Reports should be oldest first. */
export function summarizeInspection(reports: readonly InspectionReport[]): InspectionHistory | null {
  if (reports.length === 0) return null;
  const avgScore = mean(reports.map((r) => r.score)) ?? 0;
  const half = Math.floor(reports.length / 2);
  return {
    solves: reports.length,
    avgScore,
    grade: gradeFor(avgScore),
    fullyPlannedRate: reports.filter((r) => r.pauses === 0).length / reports.length,
    avgPlannedFraction: mean(reports.map((r) => r.plannedFraction)) ?? 0,
    avgExtraTurns: mean(reports.map((r) => r.crossTurns - r.optimalTurns)) ?? 0,
    xcrossRate: reports.filter((r) => r.xcross).length / reports.length,
    trend: reports.length >= 6 ? (mean(reports.slice(half).map((r) => r.score)) ?? 0) - (mean(reports.slice(0, half).map((r) => r.score)) ?? 0) : null,
  };
}
