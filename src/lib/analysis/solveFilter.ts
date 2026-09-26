import { solveFinalMs, type Solve } from "@/types";
import type { CrossFace } from "@/lib/smartcube/crossFrame";
import { solveBreakdown } from "./solveBreakdown";

/**
 * What the solve list shows about a smart-cube solve at a glance, and what
 * it can be filtered and sorted by: its four steps, its cases, its cross
 * colour, and whether any step took two looks.
 */
export interface SolveSummary {
  crossFace: CrossFace;
  /** Cross, F2L, OLL, PLL in ms. */
  steps: [number, number, number, number];
  oll: string | null;
  pll: string | null;
  twoLook: boolean;
}

export function solveSummary(solve: Solve): SolveSummary | null {
  const b = solveBreakdown(solve);
  if (!b) return null;
  const at = (label: string) => b.rows.find((r) => r.label === label)?.totalMs ?? 0;
  const f2l = b.rows.filter((r) => r.f2lPairIndex !== null).reduce((a, r) => a + (r.totalMs ?? 0), 0);
  return {
    crossFace: b.crossFace,
    steps: [at("Cross"), f2l, at("OLL"), at("PLL")],
    oll: b.rows.find((r) => r.label === "OLL")?.caseName ?? null,
    pll: b.rows.find((r) => r.label === "PLL")?.caseName ?? null,
    twoLook: b.executions.some((e) => !e.oneLook),
  };
}

export interface SolveFilter {
  oll?: string | null;
  pll?: string | null;
  cross?: CrossFace | null;
  twoLook?: boolean;
}

export type SolveSort = "recent" | "fastest" | "slowest" | "cross" | "f2l" | "oll" | "pll";
const STEP_INDEX: Partial<Record<SolveSort, number>> = { cross: 0, f2l: 1, oll: 2, pll: 3 };

export const hasFilter = (f: SolveFilter) => !!(f.oll || f.pll || f.cross || f.twoLook);

/** The solves matching the filter, in the chosen order (most recent first by default). Filters need a smart-cube breakdown. */
export function filterAndSort(solves: readonly Solve[], filter: SolveFilter, sort: SolveSort): Solve[] {
  let out = [...solves];
  if (hasFilter(filter)) {
    out = out.filter((s) => {
      const m = solveSummary(s);
      if (!m) return false;
      return (!filter.oll || m.oll === filter.oll) && (!filter.pll || m.pll === filter.pll) && (!filter.cross || m.crossFace === filter.cross) && (!filter.twoLook || m.twoLook);
    });
  }
  const step = STEP_INDEX[sort];
  const final = (s: Solve) => solveFinalMs(s) ?? Infinity;
  if (sort === "recent") out.sort((a, b) => b.date - a.date);
  else if (sort === "fastest") out.sort((a, b) => final(a) - final(b));
  else if (sort === "slowest") out.sort((a, b) => final(b) - final(a));
  else if (step !== undefined) {
    // Slowest at that step first — the ones worth looking at. Solves without a breakdown go last.
    const v = (s: Solve) => solveSummary(s)?.steps[step] ?? -1;
    out.sort((a, b) => v(b) - v(a));
  }
  return out;
}

/** The OLL and PLL cases (and cross colours) present, for the filter menus. */
export function presentCases(solves: readonly Solve[]): { oll: string[]; pll: string[]; crosses: CrossFace[] } {
  const oll = new Set<string>();
  const pll = new Set<string>();
  const crosses = new Set<CrossFace>();
  for (const s of solves) {
    const m = solveSummary(s);
    if (!m) continue;
    if (m.oll) oll.add(m.oll);
    if (m.pll) pll.add(m.pll);
    crosses.add(m.crossFace);
  }
  return { oll: [...oll].sort(), pll: [...pll].sort(), crosses: [...crosses] };
}
