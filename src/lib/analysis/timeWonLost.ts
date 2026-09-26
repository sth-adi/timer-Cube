import { solveFinalMs, type Solve } from "@/types";
import type { PostSolvePhaseRow } from "./postSolveTable";
import type { PostSolveBaseline } from "./postSolveBaseline";
import { hasBreakdown, solveBreakdown } from "./solveBreakdown";

/**
 * Where a solve won and lost its time: every step against your usual for
 * that step (its median in your own history) and against the same step of
 * your fastest solve — so "12.8" becomes "1.1s slower than usual, most of
 * it in your third pair".
 */

export interface StepDelta {
  label: string;
  ms: number;
  usualMs: number | null;
  /** This step minus your usual (negative = faster). */
  vsUsual: number | null;
  pbMs: number | null;
  vsPb: number | null;
}

export interface TimeReport {
  steps: StepDelta[];
  /** Sum of the step deltas against your usual. */
  vsUsualTotal: number | null;
  pbTotalMs: number | null;
  headline: string | null;
}

const s1 = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(2)}s`;
/** Differences smaller than this aren't worth a word. */
const NOTABLE_MS = 150;

export function timeWonLost(rows: readonly PostSolvePhaseRow[], baseline: PostSolveBaseline | null | undefined, pbRows: readonly PostSolvePhaseRow[] | null): TimeReport {
  const steps: StepDelta[] = rows
    .filter((r) => r.totalMs !== null)
    .map((r) => {
      const i = rows.indexOf(r);
      const usualMs = baseline?.segments[i]?.medianMs ?? null;
      const pbMs = pbRows?.[i]?.totalMs ?? null;
      return { label: r.label, ms: r.totalMs!, usualMs, vsUsual: usualMs === null ? null : r.totalMs! - usualMs, pbMs, vsPb: pbMs === null ? null : r.totalMs! - pbMs };
    });
  const known = steps.filter((s) => s.vsUsual !== null);
  const vsUsualTotal = known.length ? known.reduce((a, s) => a + s.vsUsual!, 0) : null;
  const pbTotalMs = pbRows && pbRows.every((r) => r.totalMs !== null) ? pbRows.reduce((a, r) => a + r.totalMs!, 0) : null;

  let headline: string | null = null;
  if (vsUsualTotal !== null && known.length) {
    const worst = [...known].sort((a, b) => b.vsUsual! - a.vsUsual!)[0];
    const best = [...known].sort((a, b) => a.vsUsual! - b.vsUsual!)[0];
    if (Math.abs(vsUsualTotal) < NOTABLE_MS) {
      headline = worst.vsUsual! >= NOTABLE_MS && best.vsUsual! <= -NOTABLE_MS ? `Right on your usual pace — ${best.label} gave back what ${worst.label} cost.` : "Right on your usual pace, step for step.";
    } else if (vsUsualTotal > 0) {
      headline = `${s1(vsUsualTotal)} slower than your usual${worst.vsUsual! >= NOTABLE_MS ? ` — ${worst.label} cost ${s1(worst.vsUsual!)} (${s1(worst.ms)} vs ${s1(worst.usualMs!)})` : ", spread across the solve"}.`;
    } else {
      headline = `${s1(vsUsualTotal)} faster than your usual${best.vsUsual! <= -NOTABLE_MS ? ` — ${best.label} won ${s1(best.vsUsual!)} (${s1(best.ms)} vs ${s1(best.usualMs!)})` : ", a little everywhere"}.`;
    }
  }
  return { steps, vsUsualTotal, pbTotalMs, headline };
}

/** Your fastest solve that can be broken down into steps, other than `exceptId` — the one to measure against. */
export function pbSolveRows(solves: readonly Solve[], exceptId?: string): { solve: Solve; rows: PostSolvePhaseRow[] } | null {
  const candidates = solves
    .filter((s) => s.id !== exceptId && !s.event && hasBreakdown(s) && solveFinalMs(s) !== null)
    .sort((a, b) => solveFinalMs(a)! - solveFinalMs(b)!);
  // The fastest one that really does break down (a reconstruction that doesn't replay is skipped).
  for (const s of candidates.slice(0, 5)) {
    const b = solveBreakdown(s);
    if (b && b.rows.every((r) => r.totalMs !== null)) return { solve: s, rows: b.rows };
  }
  return null;
}
