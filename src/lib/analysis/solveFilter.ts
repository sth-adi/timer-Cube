import { solveFinalMs, type Solve } from "@/types";
import type { CrossFace } from "@/lib/smartcube/crossFrame";
import { solveBreakdown } from "./solveBreakdown";
import { analyzeMistakes } from "./mistakeRadar";

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
  /** Whether the Mistake Radar's cheap replay flags anything in this solve — a knocked pair, a broken cross, an extra look, wasted turns. */
  hasMistake: boolean;
}

export function solveSummary(solve: Solve): SolveSummary | null {
  const b = solveBreakdown(solve);
  if (!b) return null;
  const at = (label: string) => b.rows.find((r) => r.label === label)?.totalMs ?? 0;
  const f2l = b.rows.filter((r) => r.f2lPairIndex !== null).reduce((a, r) => a + (r.totalMs ?? 0), 0);
  const frameTokens = b.frameMoves.map((m) => m.token);
  const times = b.frameMoves.map((m) => m.timeStampMs);
  const mistakes = analyzeMistakes({ scramble: b.frameScramble, moves: frameTokens, timesMs: times, totalMs: b.totalMs }).mistakes;
  return {
    crossFace: b.crossFace,
    steps: [at("Cross"), f2l, at("OLL"), at("PLL")],
    oll: b.rows.find((r) => r.label === "OLL")?.caseName ?? null,
    pll: b.rows.find((r) => r.label === "PLL")?.caseName ?? null,
    twoLook: b.executions.some((e) => !e.oneLook),
    hasMistake: mistakes.length > 0,
  };
}

export interface SolveFilter {
  /** Only solves made on this cube (its id — see lib/smartcube/cubeIdentity.ts). Needs no breakdown. */
  cube?: string | null;
  oll?: string | null;
  pll?: string | null;
  cross?: CrossFace | null;
  twoLook?: boolean;
  mistake?: boolean;
}

export type SolveSort = "recent" | "fastest" | "slowest" | "cross" | "f2l" | "oll" | "pll";
const STEP_INDEX: Partial<Record<SolveSort, number>> = { cross: 0, f2l: 1, oll: 2, pll: 3 };

export const hasFilter = (f: SolveFilter) => !!(f.cube || f.oll || f.pll || f.cross || f.twoLook || f.mistake);

/** The filters that read a solve's breakdown (the rest only need the row itself). */
const needsBreakdown = (f: SolveFilter) => !!(f.oll || f.pll || f.cross || f.twoLook || f.mistake);

/** The cubes solves were made on, newest first — for the cube filter's choices. */
export function presentCubes(solves: readonly Solve[]): { id: string; name: string; last: number }[] {
  const byId = new Map<string, { id: string; name: string; last: number }>();
  for (const s of solves) {
    if (!s.cube) continue;
    const prev = byId.get(s.cube.id);
    if (!prev || s.date > prev.last) byId.set(s.cube.id, { id: s.cube.id, name: s.cube.name, last: s.date });
  }
  return [...byId.values()].sort((a, b) => b.last - a.last);
}

/** The solves matching the filter, in the chosen order (most recent first by default). Filters need a smart-cube breakdown. */
export function filterAndSort(solves: readonly Solve[], filter: SolveFilter, sort: SolveSort): Solve[] {
  let out = [...solves];
  if (hasFilter(filter)) {
    out = out.filter((s) => {
      if (filter.cube && s.cube?.id !== filter.cube) return false;
      if (!needsBreakdown(filter)) return true;
      const m = solveSummary(s);
      if (!m) return false;
      return (
        (!filter.oll || m.oll === filter.oll) &&
        (!filter.pll || m.pll === filter.pll) &&
        (!filter.cross || m.crossFace === filter.cross) &&
        (!filter.twoLook || m.twoLook) &&
        (!filter.mistake || m.hasMistake)
      );
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
