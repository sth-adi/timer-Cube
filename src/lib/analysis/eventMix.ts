import { solveFinalMs, type EventTag, type Session, type Solve, type WcaEvent } from "@/types";
import { avg } from "@/lib/analytics/solveMetrics";

/**
 * Event Mix: how your times compare across every puzzle and practice
 * category you actually do — 2x2 through 5x5, one-handed, with feet,
 * blindfolded — all ranked against the one baseline everyone has, ordinary
 * two-handed 3x3. A puzzle isn't stored on a solve, only on its session, so
 * this is the one report that has to join the two.
 */

const PUZZLE_LABEL: Record<WcaEvent, string> = { "222": "2x2", "333": "3x3", "444": "4x4", "555": "5x5" };
const TAG_LABEL: Record<EventTag, string> = { oh: "One-Handed", feet: "With Feet", bld: "Blindfolded" };

export interface EventStat {
  key: string;
  puzzle: WcaEvent;
  tag: EventTag | null;
  label: string;
  count: number;
  avgMs: number;
  bestMs: number;
}

/** Fewest completed (non-DNF) solves before a group counts. */
export const MIN_PER_GROUP = 10;

/** One row per (puzzle, tag) combination with enough completed solves. Pure grouping — no store access, so hand-testable without sessions in a real store. */
export function groupEventStats(solves: readonly Solve[], sessions: readonly Session[]): EventStat[] {
  const puzzleBySession = new Map(sessions.map((s) => [s.id, s.event]));
  const byKey = new Map<string, { puzzle: WcaEvent; tag: EventTag | null; times: number[] }>();
  for (const s of solves) {
    const puzzle = puzzleBySession.get(s.sessionId);
    if (!puzzle) continue;
    const finalMs = solveFinalMs(s);
    if (finalMs === null) continue;
    const tag = s.event ?? null;
    const key = tag ? `${puzzle}:${tag}` : puzzle;
    const entry = byKey.get(key) ?? { puzzle, tag, times: [] };
    entry.times.push(finalMs);
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .filter(([, v]) => v.times.length >= MIN_PER_GROUP)
    .map(([key, v]) => ({
      key,
      puzzle: v.puzzle,
      tag: v.tag,
      label: v.tag ? `${PUZZLE_LABEL[v.puzzle]} ${TAG_LABEL[v.tag]}` : PUZZLE_LABEL[v.puzzle],
      count: v.times.length,
      avgMs: avg(v.times),
      bestMs: Math.min(...v.times),
    }));
}

export interface EventMixReport {
  baseline: EventStat;
  /** Every other group, ranked slowest-relative-to-baseline first. */
  others: (EventStat & { ratio: number })[];
  headline: string;
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

/** Ranks every other group against the ordinary two-handed 3x3 baseline. Pure — testable with hand-built stats, no solves needed. */
export function summarizeEventMix(stats: readonly EventStat[]): EventMixReport | null {
  const baseline = stats.find((s) => s.puzzle === "333" && s.tag === null);
  if (!baseline || baseline.avgMs <= 0) return null;
  const others = stats
    .filter((s) => s !== baseline)
    .map((s) => ({ ...s, ratio: s.avgMs / baseline.avgMs }))
    .sort((a, b) => b.ratio - a.ratio);
  if (others.length === 0) return null;

  const slowest = others[0];
  const fastest = others[others.length - 1];
  const parts = [`Your ordinary 3x3 averages ${secs(baseline.avgMs)}s over ${baseline.count} solves.`, `${slowest.label} runs ${slowest.ratio.toFixed(2)}x that`];
  parts[parts.length - 1] += fastest === slowest ? "." : `, ${fastest.label} runs ${fastest.ratio.toFixed(2)}x.`;

  return { baseline, others, headline: parts.join(" ") };
}

export function buildEventMix(solves: readonly Solve[], sessions: readonly Session[]): EventMixReport | null {
  return summarizeEventMix(groupEventStats(solves, sessions));
}
