import { PHASES, avg, sd, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Solve Archetypes. Not every slow solve is slow the same way. Describe
 * each solve by its *shape* — what share of it went to each phase, and how
 * much of it was spent paused — then let k-means find the handful of
 * shapes your solves actually come in. Each group is named by what sets it
 * apart from your average solve, and priced by how much it costs you.
 */

export interface Archetype {
  name: string;
  blurb: string;
  count: number;
  share: number;
  meanMs: number;
  /** Mean phase times (ms), PHASES order. */
  phases: number[];
  pauseShare: number;
  /** (group mean − overall mean) × group share: this group's pull on your average. */
  costMs: number;
  /** Share of your older half of solves vs your newer half. */
  shareEarly: number;
  shareLate: number;
  /** Index into the solves (oldest first) for each member. */
  members: number[];
}

export interface ArchetypeReport {
  solves: number;
  overallMs: number;
  archetypes: Archetype[];
  /** Cluster index per solve, oldest first. */
  assignment: number[];
  headline: string;
}

export const MIN_SOLVES = 30;
const K = 4;

function features(m: SolveMetrics): number[] {
  const total = Math.max(1, m.totalMs);
  return [...m.phases.map((p) => p / total), m.pauseMs / total];
}

/** Deterministic k-means (k-means++ seeding from a fixed-seed generator). */
export function kmeans(points: readonly number[][], k: number, seed = 1): { assignment: number[]; centroids: number[][] } {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dist = (a: readonly number[], b: readonly number[]) => a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0);
  const centroids: number[][] = [points[Math.floor(rand() * points.length)].slice()];
  while (centroids.length < k) {
    const d = points.map((p) => Math.min(...centroids.map((c) => dist(p, c))));
    const total = d.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < d.length - 1; idx++) {
      r -= d[idx];
      if (r <= 0) break;
    }
    centroids.push(points[idx].slice());
  }
  let assignment = points.map(() => 0);
  for (let iter = 0; iter < 50; iter++) {
    const next = points.map((p) => {
      let best = 0;
      for (let c = 1; c < k; c++) if (dist(p, centroids[c]) < dist(p, centroids[best])) best = c;
      return best;
    });
    const changed = next.some((a, i) => a !== assignment[i]);
    assignment = next;
    for (let c = 0; c < k; c++) {
      const mine = points.filter((_, i) => assignment[i] === c);
      if (mine.length) centroids[c] = mine[0].map((_, d) => avg(mine.map((p) => p[d])));
    }
    if (!changed && iter > 0) break;
  }
  return { assignment, centroids };
}

const NAMES: Record<string, { name: string; blurb: string }> = {
  Cross: { name: "Cross-heavy", blurb: "A bigger share than usual goes on the cross." },
  F2L: { name: "F2L grind", blurb: "F2L eats more of the solve than usual — pairs found late." },
  OLL: { name: "OLL stall", blurb: "Unusually long orientation — recognition or a slow alg." },
  PLL: { name: "PLL stall", blurb: "The last alg takes a bigger bite than usual." },
  pause: { name: "Stop-start", blurb: "Lots of time spent paused, whatever the phase." },
};

export function buildArchetypes(metrics: readonly SolveMetrics[]): ArchetypeReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const ordered = [...metrics].sort((a, b) => a.date - b.date);
  const raw = ordered.map(features);
  const dims = raw[0].length;
  const mu = Array.from({ length: dims }, (_, d) => avg(raw.map((r) => r[d])));
  const sigma = Array.from({ length: dims }, (_, d) => sd(raw.map((r) => r[d])) || 1);
  const z = raw.map((r) => r.map((v, d) => (v - mu[d]) / sigma[d]));
  const { assignment, centroids } = kmeans(z, K);

  const overallMs = avg(ordered.map((m) => m.totalMs));
  const half = Math.floor(ordered.length / 2);
  const used = new Set<string>();
  const clusters = centroids
    .map((c, idx) => ({ c, idx, members: ordered.map((_, i) => i).filter((i) => assignment[i] === idx) }))
    .filter((x) => x.members.length > 0);

  // The fastest group is the solve going to plan; a group holding a big
  // majority is simply your usual solve, not a special kind of slow one.
  const meanOf = (members: number[]) => avg(members.map((i) => ordered[i].totalMs));
  const flowIdx = [...clusters].sort((a, b) => meanOf(a.members) - meanOf(b.members))[0].idx;
  const typicalIdx = clusters.find((c) => c.idx !== flowIdx && c.members.length / ordered.length >= 0.45)?.idx ?? -1;

  const archetypes: Archetype[] = clusters.map(({ c, idx, members }) => {
    const labels: (PhaseName | "pause")[] = [...PHASES, "pause"];
    const order = labels.map((l, d) => ({ l, zv: c[d] })).sort((a, b) => b.zv - a.zv);
    // Named by the feature it has most of relative to your average solve;
    // if another group already took that name, the next-most-distinctive.
    const pauseZ = c[PHASES.length];
    const named =
      idx === flowIdx
        ? { name: "Flow", blurb: `Your fastest shape${pauseZ < 0 ? " — less pausing than your average solve" : ""}.` }
        : idx === typicalIdx
          ? { name: "Typical", blurb: "Most of your solves look like this — your everyday shape." }
          : (order.map((o) => NAMES[o.l]).find((n) => !used.has(n.name)) ?? NAMES[order[0].l]);
    used.add(named.name);
    const meanMs = meanOf(members);
    const early = members.filter((i) => i < half).length;
    const late = members.length - early;
    return {
      ...named,
      count: members.length,
      share: members.length / ordered.length,
      meanMs,
      phases: PHASES.map((_, k) => avg(members.map((i) => ordered[i].phases[k]))),
      pauseShare: avg(members.map((i) => ordered[i].pauseMs / Math.max(1, ordered[i].totalMs))),
      costMs: (meanMs - overallMs) * (members.length / ordered.length),
      shareEarly: early / Math.max(1, half),
      shareLate: late / Math.max(1, ordered.length - half),
      members,
    };
  });
  archetypes.sort((a, b) => a.meanMs - b.meanMs);

  const worst = [...archetypes].sort((a, b) => b.costMs - a.costMs)[0];
  const growing = [...archetypes].filter((a) => a.name !== "Flow").sort((a, b) => b.shareLate - b.shareEarly - (a.shareLate - a.shareEarly))[0];
  const flow = archetypes.find((a) => a.name === "Flow");
  const parts = [
    `${Math.round(worst.share * 100)}% of your solves are "${worst.name}" at ${(worst.meanMs / 1000).toFixed(2)}s — the shape costing your average the most.`,
  ];
  if (flow) parts.push(`Your "Flow" solves average ${(flow.meanMs / 1000).toFixed(2)}s and are ${Math.round(flow.shareLate * 100)}% of your recent half (${Math.round(flow.shareEarly * 100)}% before).`);
  if (growing && growing.shareLate - growing.shareEarly > 0.08) parts.push(`"${growing.name}" solves are becoming more common — worth a look.`);

  return {
    solves: ordered.length,
    overallMs,
    archetypes,
    assignment: ordered.map((_, i) => archetypes.findIndex((a) => a.members.includes(i))),
    headline: parts.join(" "),
  };
}
