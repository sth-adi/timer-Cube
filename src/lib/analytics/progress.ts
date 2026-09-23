import { PHASES, avg, fitLine, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Progress Forecast. Practice follows a power law: time ≈ C · n^(−p) after
 * n solves, fast gains early and slower ones later. Fitting that curve to
 * your own history (a straight line in log–log space) — overall and per
 * phase — says how fast each part of your solve is still improving, which
 * parts have stalled, and when, at this rate, you'd hit your next goal.
 */

export interface Curve {
  /** time ≈ c · n^(−p) */
  c: number;
  p: number;
  /** Predicted % faster over the next 100 solves, at your current solve count. */
  per100: number;
  /** No real improvement over your recent window. */
  plateau: boolean;
  current: number;
}

export interface PhaseProgress extends Curve {
  phase: PhaseName;
  series: number[];
}

export interface Forecast {
  goalMs: number;
  /** More solves needed at the fitted rate, or null if the curve never gets there. */
  solvesNeeded: number | null;
  daysNeeded: number | null;
}

export interface ProgressReport {
  solves: number;
  overall: Curve;
  /** Rolling average of 12 for every solve (fewer at the start). */
  rolling: number[];
  totals: number[];
  phases: PhaseProgress[];
  forecast: Forecast | null;
  solvesPerDay: number;
  headline: string;
}

export const MIN_SOLVES = 20;
const WINDOW = 12;
const GOALS_S = [120, 90, 60, 50, 45, 40, 35, 30, 27, 25, 22, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5];

export function rollingMean(xs: readonly number[], w = WINDOW): number[] {
  return xs.map((_, i) => avg(xs.slice(Math.max(0, i - w + 1), i + 1)));
}

/** Power-law learning curve over solve number 1..n, plus a plateau test on the most recent stretch. */
export function fitCurve(ys: readonly number[]): Curve {
  const xs = ys.map((_, i) => Math.log(i + 1));
  // Floored so a skipped OLL (a ~0ms phase) doesn't blow up the log.
  const ls = ys.map((y) => Math.log(Math.max(100, y)));
  const { a, b } = fitLine(xs, ls);
  const c = Math.exp(a);
  const p = -b;
  const n = ys.length;
  const per100 = 1 - ((n + 100) / n) ** -p; // negative when you're getting slower
  // Plateau: over the most recent window, the solve times aren't trending down
  // by more than their own noise (slope's t-statistic above −1).
  const w = Math.min(n, Math.max(15, Math.floor(n / 3)));
  const recent = ys.slice(-w);
  const line = fitLine(
    recent.map((_, i) => i),
    recent,
  );
  const plateau = !(line.b < 0 && line.b / line.seB < -1);
  return { c, p, per100, plateau, current: avg(ys.slice(-WINDOW)) };
}

export function solvesToReach(curve: Curve, n: number, goalMs: number): number | null {
  if (curve.p <= 0.001) return null;
  const nStar = (curve.c / goalMs) ** (1 / curve.p);
  if (!Number.isFinite(nStar)) return null;
  return Math.max(0, Math.ceil(nStar - n));
}

export function buildProgress(metrics: readonly SolveMetrics[]): ProgressReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const ordered = [...metrics].sort((a, b) => a.date - b.date);
  const totals = ordered.map((m) => m.totalMs);
  const overall = fitCurve(totals);
  const phases = PHASES.map((phase, i) => {
    const series = ordered.map((m) => m.phases[i]);
    return { phase, series, ...fitCurve(series) };
  });

  const lastDate = ordered[ordered.length - 1].date;
  const recent = ordered.filter((m) => m.date >= lastDate - 30 * 86_400_000);
  const activeDays = new Set(recent.map((m) => new Date(m.date).toDateString())).size;
  const spanDays = Math.max(1, (lastDate - recent[0].date) / 86_400_000);
  const solvesPerDay = recent.length / Math.max(activeDays, Math.min(spanDays, 30), 1);

  const goalS = GOALS_S.find((g) => g * 1000 < overall.current);
  let forecast: Forecast | null = null;
  if (goalS !== undefined) {
    const needed = solvesToReach(overall, ordered.length, goalS * 1000);
    forecast = {
      goalMs: goalS * 1000,
      solvesNeeded: needed,
      daysNeeded: needed === null || solvesPerDay <= 0 ? null : Math.ceil(needed / solvesPerDay),
    };
  }

  const improving = [...phases].filter((p) => !p.plateau).sort((a, b) => b.per100 - a.per100);
  const stalled = phases.filter((p) => p.plateau);
  const parts: string[] = [];
  parts.push(
    overall.plateau
      ? `Your average (${(overall.current / 1000).toFixed(2)}s) has levelled off recently.`
      : `You're improving about ${(overall.per100 * 100).toFixed(1)}% per 100 solves.`,
  );
  if (improving[0]) parts.push(`${improving[0].phase} is improving fastest.`);
  if (stalled.length && stalled.length < 4) {
    const names = stalled.map((s) => s.phase);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    parts.push(`${list} ${stalled.length === 1 ? "has" : "have"} stalled — that's where new practice goes.`);
  }

  return {
    solves: ordered.length,
    overall,
    rolling: rollingMean(totals),
    totals,
    phases,
    forecast,
    solvesPerDay,
    headline: parts.join(" "),
  };
}
