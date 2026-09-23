import { fitLinearRegression } from "@/lib/analysis/linearRegression";
import { avg, type SolveMetrics } from "./solveMetrics";

/**
 * Luck Meter. How much of each solve's time was the scramble? A linear
 * model fitted to your own history predicts solve time from what the
 * scramble handed you — the cross length it needed, pairs it solved for
 * free, a skipped OLL or PLL — while also accounting for how much you've
 * improved over time (log of solve number), so old slow solves don't get
 * blamed on bad luck.
 *
 * A solve's luck is how much its scramble moved the prediction against an
 * average scramble. Subtract it and you get the *earned* time — your
 * solves ranked by how well you actually solved them.
 */

export interface LuckFactor {
  key: string;
  label: string;
  /** Ms per unit (per cross move, per free pair, per skip). */
  msPerUnit: number;
  mean: number;
  /** The fit points the implausible way (e.g. a longer cross saving time): not a real effect in your data yet. */
  unclear: boolean;
}

export interface LuckSolve {
  id: string;
  date: number;
  totalMs: number;
  /** Negative = the scramble saved you time. */
  luckMs: number;
  earnedMs: number;
}

export interface LuckReport {
  solves: LuckSolve[];
  factors: LuckFactor[];
  /** Typical size of a solve's luck (standard deviation, ms). */
  luckSpreadMs: number;
  pb: LuckSolve;
  bestEarned: LuckSolve;
  /** Mean luck of your last 12 solves. */
  recentLuckMs: number;
  byRaw: LuckSolve[];
  byEarned: LuckSolve[];
  headline: string;
}

export const MIN_SOLVES = 25;

/** `helps`: whether more of it should make a solve faster — used to flag fits that come out the wrong way (noise, not a real effect). */
const CANDIDATES: { key: string; label: string; get: (m: SolveMetrics) => number; minCount?: number; helps: boolean }[] = [
  { key: "cross", label: "Each extra move the cross needs", get: (m) => m.crossOptimal, helps: false },
  { key: "free", label: "Each F2L pair the scramble solved", get: (m) => m.freePairs, minCount: 3, helps: true },
  { key: "oll", label: "An OLL skip", get: (m) => (m.ollSkip ? 1 : 0), minCount: 3, helps: true },
  { key: "pll", label: "A PLL skip", get: (m) => (m.pllSkip ? 1 : 0), minCount: 3, helps: true },
];

export function buildLuck(metrics: readonly SolveMetrics[]): LuckReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const ordered = [...metrics].sort((a, b) => a.date - b.date);
  // Only factors that actually vary (with a few non-zero cases for the rare
  // ones) — a column that never changes can't be separated from the intercept.
  const used = CANDIDATES.filter((c) => {
    const xs = ordered.map(c.get);
    const varies = xs.some((x) => x !== xs[0]);
    const nonZero = xs.filter((x) => x !== 0).length;
    return varies && (!c.minCount || nonZero >= c.minCount);
  });
  const rows = ordered.map((m, i) => [Math.log(i + 1), ...used.map((c) => c.get(m))]);
  const fit = fitLinearRegression(
    rows,
    ordered.map((m) => m.totalMs),
  );
  if (!fit) return null;

  const means = used.map((c) => avg(ordered.map(c.get)));
  const coef = fit.coefficients.slice(2); // [intercept, log n, ...luck]
  const unclear = used.map((c, j) => (c.helps ? coef[j] > 0 : coef[j] < 0));
  const solves: LuckSolve[] = ordered.map((m) => {
    // A factor pointing the implausible way is noise: it doesn't count toward luck.
    const luckMs = used.reduce((s, c, j) => s + (unclear[j] ? 0 : coef[j] * (c.get(m) - means[j])), 0);
    return { id: m.id, date: m.date, totalMs: m.totalMs, luckMs, earnedMs: m.totalMs - luckMs };
  });
  const factors = used.map((c, j) => ({ key: c.key, label: c.label, msPerUnit: coef[j], mean: means[j], unclear: unclear[j] }));
  const luckSpreadMs = Math.sqrt(avg(solves.map((s) => s.luckMs ** 2)));
  const byRaw = [...solves].sort((a, b) => a.totalMs - b.totalMs);
  const byEarned = [...solves].sort((a, b) => a.earnedMs - b.earnedMs);
  const pb = byRaw[0];
  const bestEarned = byEarned[0];
  const recentLuckMs = avg(solves.slice(-12).map((s) => s.luckMs));

  const s2 = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(2)}s`;
  const parts: string[] = [];
  parts.push(
    pb.luckMs < -100
      ? `Your ${s2(pb.totalMs)} PB had ${s2(pb.luckMs)} of scramble luck in it — luck-adjusted it's ${s2(pb.earnedMs)}.`
      : `Your ${s2(pb.totalMs)} PB was earned: its scramble was ${pb.luckMs > 100 ? `${s2(pb.luckMs)} harder than average` : "about average"}.`,
  );
  if (bestEarned.id !== pb.id) parts.push(`Your best-earned solve is a ${s2(bestEarned.totalMs)} — ${s2(bestEarned.earnedMs)} after luck.`);
  if (Math.abs(recentLuckMs) > 150) parts.push(`Your last 12 scrambles were ${s2(recentLuckMs)} ${recentLuckMs < 0 ? "kinder" : "harsher"} than usual — read your recent average with that in mind.`);

  return { solves, factors, luckSpreadMs, pb, bestEarned, recentLuckMs, byRaw, byEarned, headline: parts.join(" ") };
}
