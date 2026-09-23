import { PHASES, avg, type PhaseName, type SolveMetrics } from "./solveMetrics";

/**
 * Stall Map. Line up your recent solves phase by phase — each phase
 * stretched to the same width, so the start of F2L in one solve sits above
 * the start of F2L in every other — and paint every pause where it
 * happened. Averaged down the columns, the hot spots are the moments your
 * lookahead reliably runs dry: the cross-to-F2L transition, the start of
 * OLL, halfway through F2L.
 */

export const BINS_PER_PHASE = 8;

export interface StallCell {
  /** Pause ms in this bin for this solve. */
  ms: number;
}

export interface Hotspot {
  phase: PhaseName;
  /** 0..1 position within the phase where the bin starts. */
  from: number;
  to: number;
  /** Mean pause ms per solve in this bin. */
  ms: number;
  where: string;
}

export interface StallMapReport {
  solves: number;
  /** rows[solve][column] — solves oldest → newest, PHASES × BINS_PER_PHASE columns. */
  rows: number[][];
  /** Mean pause ms per solve, per column. */
  columns: number[];
  hotspots: Hotspot[];
  /** Mean pause ms per solve, per phase. */
  byPhase: number[];
  headline: string;
}

export const MIN_SOLVES = 10;
const HISTORY = 60;

function describe(phase: PhaseName, from: number): string {
  const part = from < 0.25 ? "start" : from < 0.5 ? "first half" : from < 0.75 ? "second half" : "end";
  if (phase === "Cross") return part === "start" ? "your first turns (inspection plan running out)" : `the ${part} of the cross`;
  if (phase === "F2L") return part === "start" ? "right after the cross (finding the first pair)" : part === "end" ? "the last slot" : `the ${part} of F2L`;
  if (phase === "OLL") return part === "start" ? "the start of OLL (recognition)" : `the ${part} of OLL`;
  return part === "start" ? "the start of PLL (recognition)" : part === "end" ? "the final AUF" : `the ${part} of PLL`;
}

/** Which column a moment in the solve falls in. */
export function columnFor(m: SolveMetrics, atMs: number): number {
  let prev = 0;
  for (let p = 0; p < 4; p++) {
    const end = m.phaseEnds[p];
    if (atMs <= end || p === 3) {
      const len = Math.max(1, end - prev);
      const f = Math.min(0.9999, Math.max(0, (atMs - prev) / len));
      return p * BINS_PER_PHASE + Math.floor(f * BINS_PER_PHASE);
    }
    prev = end;
  }
  return 4 * BINS_PER_PHASE - 1;
}

export function buildStallMap(metrics: readonly SolveMetrics[]): StallMapReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const recent = [...metrics].sort((a, b) => a.date - b.date).slice(-HISTORY);
  const cols = 4 * BINS_PER_PHASE;
  const rows = recent.map((m) => {
    const row = new Array<number>(cols).fill(0);
    for (const p of m.pauses) row[columnFor(m, p.atMs)] += p.ms;
    return row;
  });
  const columns = Array.from({ length: cols }, (_, c) => avg(rows.map((r) => r[c])));
  const byPhase = PHASES.map((_, p) => columns.slice(p * BINS_PER_PHASE, (p + 1) * BINS_PER_PHASE).reduce((a, b) => a + b, 0));

  const hotspots: Hotspot[] = columns
    .map((ms, c) => {
      const phase = PHASES[Math.floor(c / BINS_PER_PHASE)];
      const from = (c % BINS_PER_PHASE) / BINS_PER_PHASE;
      return { phase, from, to: from + 1 / BINS_PER_PHASE, ms, where: describe(phase, from) };
    })
    .filter((h) => h.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3);

  const total = byPhase.reduce((a, b) => a + b, 0);
  const headline = hotspots.length
    ? `You lose the most to pauses at ${hotspots[0].where}: ${(hotspots[0].ms / 1000).toFixed(2)}s per solve on average, of ${(total / 1000).toFixed(2)}s paused in all.`
    : "Barely any pauses in your recent solves — nothing to map.";

  return { solves: recent.length, rows, columns, hotspots, byPhase, headline };
}
