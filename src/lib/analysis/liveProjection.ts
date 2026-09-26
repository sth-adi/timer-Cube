import { MILESTONES } from "@/lib/pacer/pacer";

/**
 * Live in-solve projection: at every milestone of a smart-cube solve
 * (cross, each pair, F2L, OLL), where this solve is heading. For each
 * milestone it learns, from your own history, how your finishing time
 * relates to when you reached that point — a straight-line fit when there
 * are enough solves (a fast cross usually means a fast solve, but not
 * one-for-one), your median remaining time otherwise — and reports its
 * own typical error on those solves, so the number comes with an honest ±.
 */

export interface MilestoneModel {
  k: number;
  n: number;
  /** total ≈ a + b × (time at milestone), or null when too few solves for a fit. */
  fit: { a: number; b: number } | null;
  medianRemainingMs: number;
  /** Median time you reach this milestone. */
  typicalMs: number;
  /** Mean absolute error of the projection on your own solves. */
  maeMs: number;
}

export interface ProjectionModel {
  milestones: (MilestoneModel | null)[];
  pbMs: number | null;
  meanMs: number | null;
}

export const MIN_PROJECTION_SOLVES = 5;
const MIN_FIT_SOLVES = 12;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function leastSquares(xs: readonly number[], ys: readonly number[], maxSlope: number): { a: number; b: number } | null {
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx <= 0) return null;
  // Keep the slope physical: reaching a milestone later never means finishing sooner, and a
  // near-constant milestone time (tiny spread) mustn't blow the slope up past twice proportional.
  const b = Math.min(maxSlope, Math.max(0, sxy / sxx));
  return { a: my - b * mx, b };
}

/** Learns one projection per milestone from your solves' milestone times (MILESTONES order, last = solved). */
export function buildProjectionModel(history: readonly (readonly (number | null)[])[], pbMs: number | null): ProjectionModel {
  const complete = history.filter((h) => h[6] !== null && h[6]! > 0);
  const milestones = MILESTONES.slice(0, 6).map((_, k): MilestoneModel | null => {
    const rows = complete.filter((h) => h[k] !== null).map((h) => ({ x: h[k]!, y: h[6]! }));
    if (rows.length < MIN_PROJECTION_SOLVES) return null;
    const medianRemainingMs = median(rows.map((r) => r.y - r.x));
    const proportional = median(rows.map((r) => r.y)) / Math.max(1, median(rows.map((r) => r.x)));
    const fit = rows.length >= MIN_FIT_SOLVES ? leastSquares(rows.map((r) => r.x), rows.map((r) => r.y), 2 * proportional) : null;
    const guess = (x: number) => (fit ? Math.max(x, fit.a + fit.b * x) : x + medianRemainingMs);
    const maeMs = rows.reduce((a, r) => a + Math.abs(guess(r.x) - r.y), 0) / rows.length;
    return { k, n: rows.length, fit, medianRemainingMs, typicalMs: median(rows.map((r) => r.x)), maeMs };
  });
  const totals = complete.map((h) => h[6]!);
  return { milestones, pbMs, meanMs: totals.length ? totals.reduce((a, t) => a + t, 0) / totals.length : null };
}

export interface Projection {
  milestone: string;
  k: number;
  atMs: number;
  projectedMs: number;
  errMs: number;
  /** When you reached this milestone minus when you usually do (negative = early). */
  vsTypicalMs: number;
  headline: string;
  detail: string;
  pbPace: boolean;
}

const s2 = (ms: number) => (ms / 1000).toFixed(2);

/** The projection from the latest milestone reached so far, or null before the first one (or with too little history). */
export function projectLive(model: ProjectionModel, live: readonly (number | null)[]): Projection | null {
  let k = -1;
  for (let i = 0; i < 6; i++) if (live[i] !== null && model.milestones[i]) k = i;
  if (k < 0) return null;
  const m = model.milestones[k]!;
  const atMs = live[k]!;
  const projectedMs = Math.max(atMs, m.fit ? m.fit.a + m.fit.b * atMs : atMs + m.medianRemainingMs);
  const vsTypicalMs = atMs - m.typicalMs;
  const pbPace = model.pbMs !== null && projectedMs < model.pbMs;
  const inReach = model.pbMs !== null && !pbPace && projectedMs - m.maeMs < model.pbMs;
  const name = MILESTONES[k];
  const early = Math.abs(vsTypicalMs) < 100 ? `${name} right on your usual` : vsTypicalMs < 0 ? `${name} ${s2(-vsTypicalMs)}s earlier than usual` : `${name} ${s2(vsTypicalMs)}s later than usual`;
  return {
    milestone: name,
    k,
    atMs,
    projectedMs,
    errMs: m.maeMs,
    vsTypicalMs,
    headline: pbPace ? "PB pace" : inReach ? "PB in reach" : model.meanMs !== null && projectedMs < model.meanMs ? "Better than average" : "On pace",
    detail: early,
    pbPace,
  };
}
