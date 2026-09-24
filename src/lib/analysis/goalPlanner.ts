import { PHASES, quantile, type PhaseName, type SolveMetrics } from "@/lib/analytics/solveMetrics";

/**
 * Goal Planner: pick a target average and get a phase-by-phase budget for
 * it, drawn only from what you already do on good days. Each phase's
 * "good day" is your 25th-percentile time for it and "best days" your
 * 10th — so a plan that fits within good days is consistency, not new
 * skill; one that needs best days is a stretch; one that needs more than
 * that means learning something new, and the plan says so.
 */

export interface PhasePlan {
  phase: PhaseName;
  medianMs: number;
  goodMs: number;
  bestMs: number;
  /** How much of the gap this phase is asked to close. */
  cutMs: number;
  targetMs: number;
}

export type Reach = "already" | "good-days" | "best-days" | "beyond";

export interface GoalPlan {
  targetMs: number;
  /** Sum of your phase medians — the model's "typical solve". */
  currentMs: number;
  needMs: number;
  phases: PhasePlan[];
  reach: Reach;
  /** Time still uncovered after asking every phase for its best-days level. */
  shortfallMs: number;
  headline: string;
}

export const MIN_SOLVES = 20;

/**
 * Your typical solve as the planner sees it: the sum of each phase's median.
 * Use this (not the median of total times — skewed phases make that larger)
 * so a default target is always measured against the same number the plan is.
 */
export function typicalSolveMs(metrics: readonly SolveMetrics[]): number {
  return PHASES.reduce((s, _, i) => s + quantile(metrics.map((m) => m.phases[i]), 0.5), 0);
}

/** The next whole second below your typical solve — a goal that's always just out of reach. */
export function defaultTargetMs(currentMs: number): number {
  return Math.max(1000, (Math.ceil(currentMs / 1000) - 1) * 1000);
}

export function planGoal(metrics: readonly SolveMetrics[], targetMs: number): GoalPlan | null {
  if (metrics.length < MIN_SOLVES) return null;
  const rows = PHASES.map((phase, i) => {
    const xs = metrics.map((m) => m.phases[i]);
    return { phase, medianMs: quantile(xs, 0.5), goodMs: quantile(xs, 0.25), bestMs: quantile(xs, 0.1), cutMs: 0 };
  });
  const currentMs = rows.reduce((s, r) => s + r.medianMs, 0);
  const needMs = Math.max(0, currentMs - targetMs);

  // Greedy: ask the phase with the most room first, good-day room before best-day room.
  let remaining = needMs;
  for (const tier of ["goodMs", "bestMs"] as const) {
    const byRoom = [...rows].sort((a, b) => b.medianMs - b.cutMs - b[tier] - (a.medianMs - a.cutMs - a[tier]));
    for (const r of byRoom) {
      if (remaining <= 0) break;
      const room = Math.max(0, r.medianMs - r.cutMs - r[tier]);
      const take = Math.min(room, remaining);
      r.cutMs += take;
      remaining -= take;
    }
  }
  const goodRoom = rows.reduce((s, r) => s + (r.medianMs - r.goodMs), 0);
  const reach: Reach = needMs === 0 ? "already" : needMs <= goodRoom ? "good-days" : remaining <= 0 ? "best-days" : "beyond";
  const phases = rows.map((r) => ({ ...r, targetMs: r.medianMs - r.cutMs }));

  const s = (ms: number) => (ms / 1000).toFixed(2);
  const biggest = [...phases].sort((a, b) => b.cutMs - a.cutMs)[0];
  const headline =
    reach === "already"
      ? `Your typical solve (${s(currentMs)}s) is already under ${s(targetMs)}s — pick a faster target.`
      : reach === "good-days"
        ? `${s(targetMs)}s is within reach with consistency alone — no phase has to beat its good-day level. The biggest ask is ${biggest.phase}, down ${s(biggest.cutMs)}s to ${s(biggest.targetMs)}s.`
        : reach === "best-days"
          ? `${s(targetMs)}s needs best-day phases, not just good days — ${biggest.phase} has to drop ${s(biggest.cutMs)}s. A stretch, but you've done every part of it before.`
          : `${s(targetMs)}s is ${s(remaining)}s beyond even your best days in every phase — that gap needs new skill, not consistency. ${biggest.phase} is where the most room is.`;

  return { targetMs, currentMs, needMs, phases, reach, shortfallMs: Math.max(0, remaining), headline };
}
