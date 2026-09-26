import { solveFinalMs, type Solve } from "@/types";
import { fitLine } from "@/lib/analytics/solveMetrics";
import type { PhaseName } from "@/lib/analytics/solveMetrics";

/**
 * Training Journey: a goal turned into a road. Pick a target average and a
 * deadline; the journey lays out a checkpoint for every week (front-loaded,
 * the way practice actually pays off), gives each week one focus — the
 * phases with the most to give first, taken from the Goal Planner's budget
 * — and a solve count. Then every week is marked against its checkpoint
 * from your real solves, the trend is projected to the deadline, and when
 * you fall behind it says by how much the plan should move.
 */

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

export type Focus = PhaseName | "Consistency" | "Consolidate";

export interface Journey {
  createdAt: number;
  /** Your average when the journey began. */
  baselineMs: number;
  targetMs: number;
  weeks: number;
  solvesPerWeek: number;
  /** Each week's focus, fixed when the journey is made. */
  focus: Focus[];
}

export interface WeekPlan {
  index: number;
  start: number;
  end: number;
  checkpointMs: number;
  focus: Focus;
}

/** A robust average: the mean with the fastest and slowest 10% dropped (DNFs are left out). */
export function trimmedMean(times: readonly number[]): number | null {
  if (!times.length) return null;
  const xs = [...times].sort((a, b) => a - b);
  const cut = Math.floor(xs.length * 0.1);
  const kept = xs.slice(cut, xs.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

const finals = (solves: readonly Solve[]) => solves.flatMap((s) => (s.event ? [] : ((f) => (f === null ? [] : [f]))(solveFinalMs(s))));

/** Where you are now: the trimmed mean of your last 50 solves, or null with fewer than 12. */
export function currentLevelMs(solves: readonly Solve[], before = Infinity): number | null {
  const recent = [...solves]
    .filter((s) => s.date < before)
    .sort((a, b) => a.date - b.date)
    .slice(-50);
  const xs = finals(recent);
  return xs.length >= 12 ? trimmedMean(xs) : null;
}

/** Front-loaded progress from baseline to target: most of the drop comes early, the last weeks are about holding it. */
export function checkpointAt(baselineMs: number, targetMs: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return baselineMs - (baselineMs - targetMs) * (1 - (1 - u) ** 1.6);
}

/**
 * One focus per week. With a phase budget, weeks go to phases in proportion
 * to how much of the gap each is asked to close (biggest first); a journey
 * of three weeks or more ends on a consolidation week.
 */
export function assignFocus(weeks: number, cuts: readonly { phase: PhaseName; cutMs: number }[]): Focus[] {
  const last: Focus[] = weeks >= 3 ? ["Consolidate"] : [];
  const n = weeks - last.length;
  const useful = cuts.filter((c) => c.cutMs > 0).sort((a, b) => b.cutMs - a.cutMs);
  const total = useful.reduce((s, c) => s + c.cutMs, 0);
  if (!total) return [...Array.from({ length: n }, (): Focus => "Consistency"), ...last];
  // Largest-remainder apportionment, then every phase with a real ask gets at least a week if there's room.
  const raw = useful.map((c) => (c.cutMs / total) * n);
  const alloc = raw.map(Math.floor);
  let left = n - alloc.reduce((a, b) => a + b, 0);
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (left <= 0) break;
    alloc[i]++;
    left--;
  }
  for (let i = 0; i < useful.length; i++) {
    if (alloc[i] > 0 || useful[i].cutMs < total * 0.1) continue;
    const donor = alloc.indexOf(Math.max(...alloc));
    if (alloc[donor] > 1) {
      alloc[donor]--;
      alloc[i]++;
    }
  }
  return [...useful.flatMap((c, i) => Array.from({ length: alloc[i] }, (): Focus => c.phase)), ...last];
}

export function weekPlans(j: Journey): WeekPlan[] {
  return Array.from({ length: j.weeks }, (_, i) => ({
    index: i,
    start: j.createdAt + i * WEEK,
    end: j.createdAt + (i + 1) * WEEK,
    checkpointMs: checkpointAt(j.baselineMs, j.targetMs, (i + 1) / j.weeks),
    focus: j.focus[i] ?? "Consistency",
  }));
}

export type WeekStatus = "ahead" | "on-track" | "behind" | "missed" | "current" | "upcoming";

export interface WeekReview {
  plan: WeekPlan;
  status: WeekStatus;
  solves: number;
  meanMs: number | null;
}

export interface JourneyReview {
  weeks: WeekReview[];
  /** Index of the week you're in (weeks.length once the deadline has passed). */
  current: number;
  /** Where the trend puts you at the deadline, or null without enough data. */
  projectedMs: number | null;
  onPace: boolean | null;
  finished: boolean;
  reached: boolean;
  headline: string;
  advice: string[];
}

/** Within this fraction of a checkpoint counts as on track. */
const ON_TRACK = 0.02;
/** A week needs this many solves to be judged at all. */
const MIN_WEEK_SOLVES = 5;

const s2 = (ms: number) => (ms / 1000).toFixed(2);

export function reviewJourney(j: Journey, solves: readonly Solve[], now: number): JourneyReview {
  const plans = weekPlans(j);
  const current = Math.min(plans.length, Math.max(0, Math.floor((now - j.createdAt) / WEEK)));
  const weeks: WeekReview[] = plans.map((plan) => {
    const inWeek = solves.filter((s) => s.date >= plan.start && s.date < plan.end && s.date <= now);
    const xs = finals(inWeek);
    const meanMs = xs.length >= MIN_WEEK_SOLVES ? trimmedMean(xs) : null;
    let status: WeekStatus;
    if (plan.start > now) status = "upcoming";
    else if (plan.end > now) status = "current";
    else if (meanMs === null) status = "missed";
    else if (meanMs < plan.checkpointMs * (1 - ON_TRACK)) status = "ahead";
    else if (meanMs <= plan.checkpointMs * (1 + ON_TRACK)) status = "on-track";
    else status = "behind";
    return { plan, status, solves: inWeek.length, meanMs };
  });

  // Trend: a line through the weekly averages so far (baseline at week 0), carried to the deadline.
  const points = [{ x: 0, y: j.baselineMs }, ...weeks.flatMap((w, i) => (w.meanMs !== null && w.status !== "upcoming" ? [{ x: i + 1, y: w.meanMs }] : []))];
  let projectedMs: number | null = null;
  let slope: number | null = null;
  if (points.length >= 3) {
    const { a, b } = fitLine(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
    slope = b;
    projectedMs = a + b * j.weeks;
  }
  const finished = now >= j.createdAt + j.weeks * WEEK;
  // The week in progress only counts once it has a real sample behind it.
  const lastJudged = [...weeks].reverse().find((w) => w.meanMs !== null && (w.status === "current" ? w.solves >= 25 : w.status !== "upcoming"));
  const reached = lastJudged?.meanMs !== null && lastJudged !== undefined && lastJudged.meanMs! <= j.targetMs;
  const onPace = projectedMs === null ? null : projectedMs <= j.targetMs * (1 + ON_TRACK);

  const done = weeks.filter((w) => w.status !== "upcoming" && w.status !== "current");
  let headline: string;
  if (reached && lastJudged) headline = `You're there — ${s2(lastJudged.meanMs!)}s against a target of ${s2(j.targetMs)}s.`;
  else if (finished) headline = `The deadline has passed at ${lastJudged?.meanMs ? `${s2(lastJudged.meanMs)}s` : "no recent average"} — ${s2(j.targetMs)}s not reached yet.`;
  else if (!done.length) headline = `Week 1 of ${j.weeks}: aim for ${s2(plans[0].checkpointMs)}s by the end of the week, with the focus on ${plans[0].focus}.`;
  else {
    const last = done[done.length - 1];
    const vs =
      last.meanMs === null
        ? "no week average (too few solves)"
        : `${s2(last.meanMs)}s against a checkpoint of ${s2(last.plan.checkpointMs)}s — ${last.status === "ahead" ? "ahead" : last.status === "on-track" ? "on track" : "behind"}`;
    headline = `Week ${current + 1} of ${j.weeks}. Last week: ${vs}.`;
  }

  const advice: string[] = [];
  if (!finished && !reached) {
    const recent = done.slice(-2);
    if (recent.length === 2 && recent.every((w) => w.status === "behind" || w.status === "missed")) {
      if (slope !== null && slope < 0 && lastJudged?.meanMs) {
        const weeksMore = Math.ceil((lastJudged.meanMs - j.targetMs) / -slope);
        const extra = Math.max(1, current + weeksMore - j.weeks);
        advice.push(`Two weeks behind. At your real rate you'd need about ${extra} more week${extra === 1 ? "" : "s"} — extend the deadline, or ease the target to ${s2(projectedMs!)}s.`);
      } else {
        advice.push(`Two weeks behind and not trending down yet — the plan's pace isn't happening. Ease the target or extend the deadline, and look at the focus drills.`);
      }
    } else if (onPace === true && done.length >= 2) {
      advice.push(`On pace: the trend reaches ${s2(projectedMs!)}s by the deadline.`);
    }
    const lastDone = done[done.length - 1];
    if (lastDone && lastDone.solves < j.solvesPerWeek * 0.6) {
      advice.push(`${lastDone.solves} of ${j.solvesPerWeek} planned solves last week — volume is the easiest lever you have.`);
    }
  }
  return { weeks, current, projectedMs, onPace, finished, reached, headline, advice };
}
