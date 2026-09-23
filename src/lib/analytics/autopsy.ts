import { PHASES, avg, sd, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Fast vs Slow Autopsy. Take your fastest quarter of solves and your
 * slowest quarter and compare them on every measurable thing — phase
 * times, pausing, turning speed, move count, rotations, and the scramble
 * itself — ranked by effect size (Cohen's d: the difference in means over
 * the pooled spread, so "big" means big *relative to how much it normally
 * varies*). What separates your good solves from your bad ones is the
 * thing to train; if it's scramble luck, it's the thing to stop worrying about.
 */

export type Family = "skill" | "luck";

export interface Factor {
  key: string;
  label: string;
  family: Family;
  fast: number;
  slow: number;
  /** Positive = the slow group had more of it. */
  d: number;
  format: (v: number) => string;
  /** Whether more of this is good for you (turning speed, free pairs, skips). */
  higherIsBetter: boolean;
}

export interface Autopsy {
  groupSize: number;
  fastMean: number;
  slowMean: number;
  gapMs: number;
  /** How the gap splits across phases (slow − fast; sums to gapMs). */
  phaseGap: { phase: PhaseName; ms: number }[];
  factors: Factor[];
  headline: string;
  luckVerdict: string;
}

/** Needs at least this many solves (a quarter of them per group) to say anything. */
export const MIN_SOLVES = 12;

const s2 = (v: number) => `${(v / 1000).toFixed(2)}s`;
const n1 = (v: number) => v.toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const tps = (v: number) => `${v.toFixed(2)} TPS`;

function effect(a: readonly number[], b: readonly number[]): number {
  const pooled = Math.sqrt(((a.length - 1) * sd(a) ** 2 + (b.length - 1) * sd(b) ** 2) / Math.max(1, a.length + b.length - 2));
  const diff = avg(b) - avg(a);
  if (pooled < 1e-9) return diff === 0 ? 0 : Math.sign(diff) * 3;
  return Math.max(-3, Math.min(3, diff / pooled));
}

export function buildAutopsy(metrics: readonly SolveMetrics[]): Autopsy | null {
  if (metrics.length < MIN_SOLVES) return null;
  const sorted = [...metrics].sort((a, b) => a.totalMs - b.totalMs);
  const k = Math.floor(sorted.length / 4);
  const fast = sorted.slice(0, k);
  const slow = sorted.slice(-k);

  const factor = (key: string, label: string, family: Family, get: (m: SolveMetrics) => number, format: (v: number) => string, higherIsBetter = false): Factor => {
    const a = fast.map(get);
    const b = slow.map(get);
    return { key, label, family, fast: avg(a), slow: avg(b), d: effect(a, b), format, higherIsBetter };
  };

  const factors: Factor[] = [
    ...PHASES.map((p, i) => factor(`phase-${p}`, `${p} time`, "skill", (m) => m.phases[i], s2)),
    factor("pause", "Time spent paused", "skill", (m) => m.pauseMs, s2),
    factor("f2lPause", "Pausing during F2L", "skill", (m) => m.f2lPauseMs, s2),
    factor("longest", "Longest single pause", "skill", (m) => m.longestPauseMs, s2),
    factor("pauses", "Number of pauses", "skill", (m) => m.pauseCount, n1),
    factor("exec", "Turning speed between pauses", "skill", (m) => m.execTps, tps, true),
    factor("turns", "Turns", "skill", (m) => m.turns, n1),
    factor("cross", "Cross length the scramble needed", "luck", (m) => m.crossOptimal, n1),
    factor("free", "Pairs already solved by the scramble", "luck", (m) => m.freePairs, n1, true),
    factor("ollSkip", "OLL skips", "luck", (m) => (m.ollSkip ? 1 : 0), pct, true),
    factor("pllSkip", "PLL skips", "luck", (m) => (m.pllSkip ? 1 : 0), pct, true),
  ];
  if (metrics.every((m) => m.rotations !== null)) {
    factors.push(factor("rotations", "Whole-cube rotations", "skill", (m) => m.rotations ?? 0, n1));
  }
  factors.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  const fastMean = avg(fast.map((m) => m.totalMs));
  const slowMean = avg(slow.map((m) => m.totalMs));
  const gapMs = slowMean - fastMean;
  const phaseGap = PHASES.map((phase, i) => ({ phase, ms: avg(slow.map((m) => m.phases[i])) - avg(fast.map((m) => m.phases[i])) }));
  const worstPhase = [...phaseGap].sort((a, b) => b.ms - a.ms)[0];
  const pauseGap = factors.find((f) => f.key === "pause")!;
  const pauseShare = gapMs > 0 ? (pauseGap.slow - pauseGap.fast) / gapMs : 0;

  const headline =
    `Your slowest quarter averages ${s2(slowMean)} against ${s2(fastMean)} for your fastest — a ${s2(gapMs)} gap, ` +
    `${Math.round((worstPhase.ms / Math.max(1, gapMs)) * 100)}% of it in ${worstPhase.phase}. ` +
    (pauseShare >= 0.5
      ? `${Math.round(pauseShare * 100)}% of the gap is extra pausing, not slower hands.`
      : pauseShare <= 0.25
        ? `Most of it isn't pausing — slow solves are longer or turned slower.`
        : `About ${Math.round(pauseShare * 100)}% of it is extra pausing.`);

  const luck = factors.filter((f) => f.family === "luck");
  const bigLuck = luck.filter((f) => Math.abs(f.d) >= 0.5);
  const luckVerdict = bigLuck.length
    ? `The scramble plays a part: ${bigLuck
        .map((f) => `${f.label.toLowerCase()} ${f.format(f.fast)} → ${f.format(f.slow)}`)
        .join("; ")} (fast → slow).`
    : "Scramble luck barely differs between the two groups — the gap is how you solved them, which means it's trainable.";

  return { groupSize: k, fastMean, slowMean, gapMs, phaseGap, factors, headline, luckVerdict };
}
