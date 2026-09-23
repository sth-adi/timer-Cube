import { PHASES, avg, quantile, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Warm-up & Fatigue. Split your history into sittings (solves with less
 * than 15 minutes between them), then measure every solve against the
 * median of its own sitting — so a good day and a bad day compare fairly.
 * Averaged by position in the sitting, that gives your warm-up curve: how
 * many solves it takes before you're up to speed, which phase is coldest,
 * whether you fade late in long sittings, and whether resting between
 * solves helps or hurts.
 */

export const SITTING_GAP_MS = 15 * 60_000;
export const MIN_SITTING = 5;

export const POSITION_BUCKETS: { label: string; from: number; to: number }[] = [
  { label: "1", from: 1, to: 1 },
  { label: "2", from: 2, to: 2 },
  { label: "3", from: 3, to: 3 },
  { label: "4", from: 4, to: 4 },
  { label: "5", from: 5, to: 5 },
  { label: "6–10", from: 6, to: 10 },
  { label: "11–20", from: 11, to: 20 },
  { label: "21–40", from: 21, to: 40 },
  { label: "41+", from: 41, to: Infinity },
];

export const REST_BUCKETS: { label: string; from: number; to: number }[] = [
  { label: "< 20s", from: 0, to: 20_000 },
  { label: "20–60s", from: 20_000, to: 60_000 },
  { label: "1–3 min", from: 60_000, to: 180_000 },
  { label: "3–15 min", from: 180_000, to: SITTING_GAP_MS },
];

export interface Placed {
  position: number;
  /** Time relative to the sitting's median (0.05 = 5% slower). */
  rel: number;
  /** Each phase's time minus that phase's median in the sitting (ms) — absolute, since a near-zero phase (a skipped PLL) makes ratios meaningless. */
  phaseDeltaMs: number[];
  pauseShare: number;
  /** Rest since the previous solve ended, or null for a sitting's first solve. */
  restMs: number | null;
}

export interface BucketStat {
  label: string;
  count: number;
  rel: number | null;
  pauseShare: number | null;
}

export interface StaminaReport {
  sittings: number;
  solves: number;
  positions: BucketStat[];
  rest: BucketStat[];
  /** Solves before you're within 2% of your sitting pace (5 = "5 or more"). */
  warmupSolves: number;
  /** How much slower the warm-up solves are, on average. */
  coldPenalty: number;
  /** Which phase loses the most time in the first three solves, and how much (ms). */
  coldestPhase: { phase: PhaseName; ms: number } | null;
  phaseCold: { phase: PhaseName; ms: number }[];
  /** Late-sitting slowdown vs mid-sitting (null when you don't do long sittings). */
  fatigue: number | null;
  headline: string;
}

/** Groups solves (sorted by date) into sittings. Each solve's `date` is when it finished. */
export function sittings(metrics: readonly SolveMetrics[]): SolveMetrics[][] {
  const out: SolveMetrics[][] = [];
  const sorted = [...metrics].sort((a, b) => a.date - b.date);
  for (const m of sorted) {
    const cur = out[out.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && m.date - m.totalMs - prev.date < SITTING_GAP_MS) cur.push(m);
    else out.push([m]);
  }
  return out;
}

export function place(sitting: readonly SolveMetrics[]): Placed[] {
  const med = quantile(
    sitting.map((m) => m.totalMs),
    0.5,
  );
  const phaseMed = PHASES.map((_, i) =>
    quantile(
      sitting.map((m) => m.phases[i]),
      0.5,
    ),
  );
  return sitting.map((m, i) => ({
    position: i + 1,
    rel: m.totalMs / med - 1,
    phaseDeltaMs: m.phases.map((p, k) => p - phaseMed[k]),
    pauseShare: m.pauseMs / Math.max(1, m.totalMs),
    restMs: i === 0 ? null : Math.max(0, m.date - m.totalMs - sitting[i - 1].date),
  }));
}

function bucket(label: string, xs: readonly Placed[]): BucketStat {
  return {
    label,
    count: xs.length,
    rel: xs.length ? avg(xs.map((x) => x.rel)) : null,
    pauseShare: xs.length ? avg(xs.map((x) => x.pauseShare)) : null,
  };
}

export function buildStamina(metrics: readonly SolveMetrics[]): StaminaReport | null {
  const usable = sittings(metrics).filter((s) => s.length >= MIN_SITTING);
  if (usable.length < 3) return null;
  const placed = usable.flatMap(place);

  const positions = POSITION_BUCKETS.map((b) =>
    bucket(
      b.label,
      placed.filter((p) => p.position >= b.from && p.position <= b.to),
    ),
  );
  const rest = REST_BUCKETS.map((b) =>
    bucket(
      b.label,
      placed.filter((p) => p.restMs !== null && p.restMs >= b.from && p.restMs < b.to),
    ),
  );

  let warmupSolves = 5;
  for (let k = 0; k < 5; k++) {
    const r = positions[k].rel;
    if (r !== null && r <= 0.02) {
      warmupSolves = k;
      break;
    }
  }
  const cold = placed.filter((p) => p.position <= Math.max(1, warmupSolves));
  const coldPenalty = warmupSolves === 0 ? 0 : avg(cold.map((p) => p.rel));

  const early = placed.filter((p) => p.position <= 3);
  const settled = placed.filter((p) => p.position >= 6 && p.position <= 20);
  const phaseCold = PHASES.map((phase, i) => ({
    phase,
    ms: early.length && settled.length ? avg(early.map((p) => p.phaseDeltaMs[i])) - avg(settled.map((p) => p.phaseDeltaMs[i])) : 0,
  }));
  const coldestPhase = early.length && settled.length ? [...phaseCold].sort((a, b) => b.ms - a.ms)[0] : null;

  const late = placed.filter((p) => p.position > 30);
  const mid = placed.filter((p) => p.position >= 6 && p.position <= 30);
  const fatigue = late.length >= 5 && mid.length >= 5 ? avg(late.map((p) => p.rel)) - avg(mid.map((p) => p.rel)) : null;

  const parts: string[] = [];
  parts.push(
    warmupSolves === 0
      ? "You start sittings at full speed — no warm-up needed."
      : `Your first ${warmupSolves === 5 ? "5+" : warmupSolves} solve${warmupSolves === 1 ? " runs" : "s run"} about ${Math.round(coldPenalty * 100)}% slow — warm up with ${warmupSolves === 5 ? "5 or more" : warmupSolves} before anything that counts.`,
  );
  if (coldestPhase && coldestPhase.ms > 100) parts.push(`${coldestPhase.phase} is the coldest phase — ${(coldestPhase.ms / 1000).toFixed(2)}s slower in your first three solves.`);
  if (fatigue !== null && fatigue > 0.03) parts.push(`After 30 solves you fade by ${Math.round(fatigue * 100)}% — shorter sittings, or a break, would help.`);

  return {
    sittings: usable.length,
    solves: placed.length,
    positions,
    rest,
    warmupSolves,
    coldPenalty,
    coldestPhase,
    phaseCold,
    fatigue,
    headline: parts.join(" "),
  };
}
