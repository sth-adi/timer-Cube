import { MILESTONES, milestoneTimes } from "@/lib/pacer/pacer";
import type { Solve } from "@/types";
import type { SolvePrediction } from "./prediction";

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

/**
 * Milestone times are a pure function of a solve's scramble, moves and move
 * timestamps, but working them out replays the whole solve (~1ms each), and
 * the projection model is rebuilt from every smart solve whenever the
 * session changes. Cached by solve id — a saved solve never changes, and the
 * inputs are re-checked anyway — so a new solve only replays itself, and a
 * row that's re-read from storage (same id, new object) still hits.
 * Pre-filled during idle time by warmMilestoneCache so the first
 * LiveProjection mount of a session finds everything already worked out.
 */
interface MilestoneEntry {
  scramble: string;
  reconstruction: string;
  moveCount: number;
  firstMs: number;
  lastMs: number;
  result: (number | null)[];
}
const milestoneCache = new Map<string, MilestoneEntry>();

const entryMatches = (e: MilestoneEntry | undefined, solve: Solve): e is MilestoneEntry => {
  const ts = solve.moveTimestamps;
  return (
    !!e &&
    !!ts &&
    e.scramble === solve.scramble &&
    e.reconstruction === solve.reconstruction &&
    e.moveCount === ts.length &&
    e.firstMs === ts[0] &&
    e.lastMs === ts[ts.length - 1]
  );
};

/** A saved smart-cube solve with everything milestoneTimes needs (and not a DNF, which the projection ignores). */
export const isProjectableSolve = (s: Solve): boolean => !!(s.scramble && s.reconstruction && s.moveTimestamps?.length && s.penalty !== "dnf");

/** milestoneTimes for a saved smart-cube solve (needs scramble, reconstruction and moveTimestamps). */
export function solveMilestoneTimes(solve: Solve): (number | null)[] {
  const hit = milestoneCache.get(solve.id);
  if (entryMatches(hit, solve)) return hit.result;
  const ts = solve.moveTimestamps!;
  const result = milestoneTimes({ scramble: solve.scramble, moves: solve.reconstruction!.split(/\s+/).filter(Boolean), timesMs: ts });
  milestoneCache.set(solve.id, {
    scramble: solve.scramble,
    reconstruction: solve.reconstruction!,
    moveCount: ts.length,
    firstMs: ts[0],
    lastMs: ts[ts.length - 1],
    result,
  });
  return result;
}

/** True when this solve's milestones are already cached (so projecting from it costs nothing). */
export const hasCachedMilestones = (solve: Solve): boolean => entryMatches(milestoneCache.get(solve.id), solve);

/** Test hook: forget every cached milestone set. */
export function resetMilestoneCacheForTests(): void {
  milestoneCache.clear();
}

/** Runs `step` in idle time (requestIdleCallback, or a short timeout where that's missing); `step` gets a "ms of budget left" function. Returns a canceller. */
function scheduleIdle(step: (budgetMs: () => number) => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const h = requestIdleCallback((d) => step(() => d.timeRemaining()), { timeout: 2000 });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(() => {
    const end = performance.now() + 8;
    step(() => end - performance.now());
  }, 50);
  return () => clearTimeout(h);
}

/**
 * Works out the milestone times for every projectable solve that isn't cached
 * yet, a slice at a time while the browser is idle — so by the time a solve
 * starts, LiveProjection's first mount replays nothing. Safe to call on every
 * change to the solve list (cached solves are skipped; the newest are done
 * first). Returns a canceller for an effect cleanup.
 */
export function warmMilestoneCache(solves: readonly Solve[]): () => void {
  const todo: Solve[] = [];
  for (let i = solves.length - 1; i >= 0; i--) if (isProjectableSolve(solves[i]) && !hasCachedMilestones(solves[i])) todo.push(solves[i]);
  if (todo.length === 0) return () => {};
  let next = 0;
  let cancel = () => {};
  let cancelled = false;
  const run = (budgetMs: () => number) => {
    // Always at least one per slice so a starved idle period still makes progress.
    do {
      try {
        solveMilestoneTimes(todo[next]);
      } catch {
        // A solve that can't be replayed is skipped here; the projection itself decides what to do with it.
      }
      next++;
    } while (next < todo.length && budgetMs() > 2);
    if (!cancelled && next < todo.length) cancel = scheduleIdle(run);
  };
  cancel = scheduleIdle(run);
  return () => {
    cancelled = true;
    cancel();
  };
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
const s1 = (ms: number) => (ms / 1000).toFixed(1);

/** A projected finish as shown on the live pill: rounded to 0.1s ("12.3", "1:05.4") so it doesn't flicker through hundredths. */
export function formatProjectedMs(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const secs = (tenths % 600) / 10;
  return minutes > 0 ? `${minutes}:${secs.toFixed(1).padStart(4, "0")}` : secs.toFixed(1);
}

/**
 * Before the cross is even done there's no milestone to project from, but
 * there's already a signal: the scramble's own difficulty, which the
 * pre-solve regression model (prediction.ts) has already turned into an
 * estimate the moment the scramble appeared — same regression, same honest
 * skill-gated display, just reused here instead of the live view sitting
 * silent for the entire cross. Folded into the same Projection shape (k=-1)
 * so the rest of this module and its caller don't need a special case.
 */
export function projectPreSolve(model: ProjectionModel, prediction: SolvePrediction | null): Projection | null {
  if (!prediction?.skill?.useful) return null;
  const projectedMs = prediction.predictedMs;
  const errMs = prediction.skill.modelMaeMs;
  const pbPace = model.pbMs !== null && projectedMs < model.pbMs;
  const inReach = model.pbMs !== null && !pbPace && projectedMs - errMs < model.pbMs;
  return {
    milestone: "scramble",
    k: -1,
    atMs: 0,
    projectedMs,
    errMs,
    vsTypicalMs: 0,
    headline: pbPace ? "PB pace" : inReach ? "PB in reach" : model.meanMs !== null && projectedMs < model.meanMs ? "Better than average" : "On pace",
    detail: "from the scramble alone, before your first turn",
    pbPace,
  };
}

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

/**
 * A projection only updates at milestones, but the clock doesn't stop in
 * between: once you've spent longer since the last milestone than you
 * usually take to reach the next one, every extra millisecond goes
 * straight onto the finish (and the projection can never sit below the
 * clock itself).
 */
export function projectAtTime(model: ProjectionModel, p: Projection, elapsedMs: number): Projection {
  // k=-1 (the pre-solve, scramble-only call) has no milestone of its own —
  // "here" is just the start of the solve, at time 0.
  const here = p.k >= 0 ? model.milestones[p.k]! : null;
  const next = p.k < 5 ? model.milestones[p.k + 1] : null;
  const usualGap = next ? Math.max(0, next.typicalMs - (here?.typicalMs ?? 0)) : (here?.medianRemainingMs ?? 0);
  const overdue = Math.max(0, elapsedMs - p.atMs - usualGap);
  const projectedMs = Math.max(p.projectedMs + overdue, elapsedMs);
  if (projectedMs === p.projectedMs) return p;
  const pbPace = model.pbMs !== null && projectedMs < model.pbMs;
  const inReach = model.pbMs !== null && !pbPace && projectedMs - p.errMs < model.pbMs;
  return {
    ...p,
    projectedMs,
    pbPace,
    headline: pbPace ? "PB pace" : inReach ? "PB in reach" : model.meanMs !== null && projectedMs < model.meanMs ? "Better than average" : "On pace",
    detail: overdue > 0 ? `${s1(overdue)}s longer than usual since ${p.milestone}` : p.detail,
  };
}
