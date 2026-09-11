/**
 * Turns data this app already has lying around — spaced-repetition due
 * cases, phase-split consistency, trainer practice history, today's solve
 * count — into a short, ranked "what to do next" list. Nothing here re-runs
 * a solver or requires an extra opt-in step (unlike the Weakness report,
 * which re-analyzes saved reconstructions); it's a rules-based pass over
 * numbers the app is already computing for other cards, aimed at answering
 * "okay, but what should I actually practice today" in one glance.
 */

import { formatTime } from "@/lib/utils/time";
import type { PhaseAverage } from "@/lib/stats/stats";

export type PlanTarget = "trainer-review" | "trainer-oll" | "trainer-pll" | "trainer-zbll" | "timer";

export interface PlanItem {
  id: string;
  title: string;
  detail: string;
  target: PlanTarget;
  targetLabel: string;
}

export interface DailyPlanInput {
  dueAlgCount: number;
  /** From computePhaseSplits — null when there isn't a same-phase-count sample yet. */
  phases: readonly PhaseAverage[] | null;
  phaseSampleSize: number;
  trainerTimes: { oll: number[]; pll: number[]; zbll: number[] };
  solvesToday: number;
  dailyGoal: number;
  /** Distinct WCA events with at least one session — used only for a low-priority "try something new" nudge. */
  eventsPracticed: readonly string[];
}

const MAX_ITEMS = 4;
/** Below this many same-phase-count solves, a mean/best gap is too noisy to act on. */
const MIN_PHASE_SAMPLE = 5;
/** Minimum reps before a trainer mode's average is trusted enough to compare against another mode. */
const MIN_TRAINER_REPS_FOR_BALANCE = 10;

function scored(items: (({ priority: number } & PlanItem) | null)[]): PlanItem[] {
  return items
    .filter((i): i is { priority: number } & PlanItem => i !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_ITEMS)
    .map((item): PlanItem => {
      const { id, title, detail, target, targetLabel } = item;
      return { id, title, detail, target, targetLabel };
    });
}

export function buildDailyPlan(input: DailyPlanInput): PlanItem[] {
  const { dueAlgCount, phases, phaseSampleSize, trainerTimes, solvesToday, dailyGoal, eventsPracticed } = input;

  const dueReview =
    dueAlgCount > 0
      ? {
          id: "due-review",
          title: `Review ${dueAlgCount} due algorithm${dueAlgCount === 1 ? "" : "s"}`,
          detail: "Spaced-repetition reviews are queued and ready — a few minutes now beats relearning them cold later.",
          target: "trainer-review" as const,
          targetLabel: "Review now",
          priority: Math.min(dueAlgCount, 30) * 2,
        }
      : null;

  // The phase whose mean is furthest above its own best — a big gap means
  // your ceiling is already higher than your average, so closing it is
  // "free" time rather than something that needs new technique.
  let inconsistentPhase = null as ({ priority: number } & PlanItem) | null;
  if (phases && phaseSampleSize >= MIN_PHASE_SAMPLE) {
    let worst: PhaseAverage | null = null;
    let worstRatio = 1;
    for (const p of phases) {
      if (p.bestMs <= 0) continue;
      const ratio = p.meanMs / p.bestMs;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worst = p;
      }
    }
    if (worst && worstRatio > 1.15) {
      inconsistentPhase = {
        id: "inconsistent-phase",
        title: `Tighten up your ${worst.label}`,
        detail: `Averaging ${formatTime(worst.meanMs)} but you've hit ${formatTime(worst.bestMs)} — that gap is the biggest easy win in your last ${phaseSampleSize} phase-timed solves.`,
        target: "timer",
        targetLabel: "Back to timer",
        priority: (worstRatio - 1) * 40,
      };
    }
  }

  // Trainer-mode imbalance: only compares modes once each has enough reps
  // to have a real average, so a single lucky/unlucky case doesn't skew it.
  const ollN = trainerTimes.oll.length;
  const pllN = trainerTimes.pll.length;
  const zbllN = trainerTimes.zbll.length;
  let trainerBalance = null as ({ priority: number } & PlanItem) | null;
  if (ollN >= MIN_TRAINER_REPS_FOR_BALANCE && pllN < ollN / 3) {
    trainerBalance = {
      id: "balance-pll",
      title: "PLL recognition is lagging behind OLL",
      detail: `${ollN} OLL reps vs. just ${pllN} PLL — recognition speed only comes from reps, and PLL is due for some.`,
      target: "trainer-pll",
      targetLabel: "Drill PLL",
      priority: 12,
    };
  } else if (pllN >= MIN_TRAINER_REPS_FOR_BALANCE && ollN < pllN / 3) {
    trainerBalance = {
      id: "balance-oll",
      title: "OLL recognition is lagging behind PLL",
      detail: `${pllN} PLL reps vs. just ${ollN} OLL — recognition speed only comes from reps, and OLL is due for some.`,
      target: "trainer-oll",
      targetLabel: "Drill OLL",
      priority: 12,
    };
  } else if (ollN >= MIN_TRAINER_REPS_FOR_BALANCE && pllN >= MIN_TRAINER_REPS_FOR_BALANCE && zbllN === 0) {
    trainerBalance = {
      id: "try-zbll",
      title: "Ready to skip two-look last layer?",
      detail: "You've got real reps in OLL and PLL — ZBLL solves orientation and permutation in one algorithm instead of two. Worth a look.",
      target: "trainer-zbll",
      targetLabel: "Try ZBLL",
      priority: 8,
    };
  }

  const remaining = dailyGoal - solvesToday;
  const dailyGoalItem =
    remaining > 0
      ? {
          id: "daily-goal",
          title: `${remaining} more solve${remaining === 1 ? "" : "s"} to hit today's goal`,
          detail: `${solvesToday} of ${dailyGoal} logged so far today.`,
          target: "timer" as const,
          targetLabel: "Keep solving",
          priority: 4,
        }
      : null;

  const varietyItem =
    eventsPracticed.length === 1 && eventsPracticed[0] === "333"
      ? {
          id: "try-variety",
          title: "Only ever timed 3x3?",
          detail: "Start a 2x2 or 4x4 session for a change of pace — same timer, a genuinely different puzzle.",
          target: "timer" as const,
          targetLabel: "New session",
          priority: 1,
        }
      : null;

  return scored([dueReview, inconsistentPhase, trainerBalance, dailyGoalItem, varietyItem]);
}
