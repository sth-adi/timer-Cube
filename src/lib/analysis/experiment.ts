/**
 * Experiments: did the change actually help? You log a change — a new
 * cube, new tension, a new algorithm, a new warm-up — and this compares
 * the solves before it with the solves after, honestly:
 *
 *  - a permutation test for "could this difference be luck?",
 *  - a bootstrap interval for "how big is it, plausibly?", and
 *  - a trend-adjusted effect, because most cubers are getting faster
 *    anyway: the after-solves are compared with where your before-trend
 *    was already heading, not just with the before-average.
 *
 * Deterministic (seeded) so the same data always gives the same verdict.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function sd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

/** Two-sided permutation p-value for a difference in means. */
export function permutationP(a: readonly number[], b: readonly number[], rounds = 2000, seed = 1): number {
  const observed = Math.abs(mean(b) - mean(a));
  const all = [...a, ...b];
  const rand = mulberry32(seed);
  let extreme = 0;
  for (let r = 0; r < rounds; r++) {
    // Partial Fisher-Yates: only the first |a| slots need shuffling.
    for (let i = 0; i < a.length; i++) {
      const j = i + Math.floor(rand() * (all.length - i));
      [all[i], all[j]] = [all[j], all[i]];
    }
    let sa = 0;
    for (let i = 0; i < a.length; i++) sa += all[i];
    let sb = 0;
    for (let i = a.length; i < all.length; i++) sb += all[i];
    if (Math.abs(sb / b.length - sa / a.length) >= observed - 1e-9) extreme++;
  }
  return (extreme + 1) / (rounds + 1);
}

/** 95% bootstrap interval for mean(b) − mean(a). */
export function bootstrapCI(a: readonly number[], b: readonly number[], rounds = 2000, seed = 2): [number, number] {
  const rand = mulberry32(seed);
  const diffs: number[] = [];
  const resampleMean = (xs: readonly number[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)];
    return s / xs.length;
  };
  for (let r = 0; r < rounds; r++) diffs.push(resampleMean(b) - resampleMean(a));
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(rounds * 0.025)], diffs[Math.floor(rounds * 0.975) - 1]];
}

/** Where the before-solves' own trend (least squares on solve order) says the after-solves would have averaged anyway. */
export function trendExpectation(before: readonly number[], afterCount: number): number | null {
  const n = before.length;
  if (n < 10) return null;
  const xs = before.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(before);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (before[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const fit = (x: number) => my + slope * (x - mx);
  // Judge the after-window at its middle, and never assume more further change than the
  // whole before-window itself showed — improvement curves flatten, they don't accelerate.
  const mid = n + (afterCount - 1) / 2;
  const span = Math.abs(fit(n - 1) - fit(0));
  const extra = fit(mid) - fit(n - 1);
  return fit(n - 1) + Math.sign(extra) * Math.min(Math.abs(extra), span);
}

export type Verdict = "better" | "worse" | "unclear" | "too-few";

export interface ExperimentResult {
  nBefore: number;
  nAfter: number;
  meanBefore: number;
  meanAfter: number;
  /** after − before (negative = faster after). */
  diffMs: number;
  ci: [number, number];
  p: number;
  /** after − where the before-trend was heading; null with too little before-history. */
  trendAdjustedMs: number | null;
  verdict: Verdict;
  /** Roughly how many solves on each side would settle an "unclear" result at this effect size. */
  neededPerSide: number | null;
  headline: string;
}

export const MIN_PER_SIDE = 8;
const s2 = (ms: number) => (Math.abs(ms) / 1000).toFixed(2);

/** Before and after are solve times in chronological order (DNFs already removed). */
export function analyzeExperiment(before: readonly number[], after: readonly number[]): ExperimentResult | null {
  if (before.length < 2 || after.length < 2) return null;
  const meanBefore = mean(before);
  const meanAfter = mean(after);
  const diffMs = meanAfter - meanBefore;
  const few = before.length < MIN_PER_SIDE || after.length < MIN_PER_SIDE;
  const p = permutationP(before, after);
  const ci = bootstrapCI(before, after);
  const expected = trendExpectation(before, after.length);
  const trendAdjustedMs = expected === null ? null : meanAfter - expected;
  const significant = !few && p < 0.05 && (ci[1] < 0 || ci[0] > 0);
  const verdict: Verdict = few ? "too-few" : significant ? (diffMs < 0 ? "better" : "worse") : "unclear";

  // n per side for 80% power at this effect with the pooled spread (normal approximation).
  const pooled = Math.sqrt((sd(before) ** 2 + sd(after) ** 2) / 2);
  const neededPerSide = verdict === "unclear" && Math.abs(diffMs) > 1 ? Math.ceil((2 * (1.96 + 0.84) ** 2 * pooled ** 2) / diffMs ** 2) : null;

  const trendNote =
    trendAdjustedMs === null
      ? ""
      : Math.abs(trendAdjustedMs) < 50
        ? " That's about what your existing improvement trend predicted, so the change itself may not be why."
        : trendAdjustedMs < 0
          ? ` Even allowing for how fast you were already improving, that's ${s2(trendAdjustedMs)}s better than expected.`
          : ` But you were already improving — against that trend it's ${s2(trendAdjustedMs)}s worse than expected.`;
  const pText = p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
  const headline =
    verdict === "too-few"
      ? `Too few solves yet — at least ${MIN_PER_SIDE} on each side of the change (now ${before.length} before, ${after.length} after).`
      : verdict === "better"
        ? `Faster after the change: ${s2(diffMs)}s a solve (plausibly ${s2(ci[1])}–${s2(ci[0])}s), and very unlikely to be luck (${pText}).${trendNote}`
        : verdict === "worse"
          ? `Slower after the change: +${s2(diffMs)}s a solve (plausibly ${s2(ci[0])}–${s2(ci[1])}s), and very unlikely to be luck (${pText}).${trendNote}`
          : `No clear difference yet (${diffMs < 0 ? "−" : "+"}${s2(diffMs)}s, p = ${p.toFixed(2)}) — could easily be ordinary variation.${neededPerSide ? ` About ${neededPerSide} solves on each side would settle an effect this size.` : ""}`;
  return { nBefore: before.length, nAfter: after.length, meanBefore, meanAfter, diffMs, ci, p, trendAdjustedMs, verdict, neededPerSide, headline };
}
