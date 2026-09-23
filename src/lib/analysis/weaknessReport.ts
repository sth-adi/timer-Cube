/**
 * Aggregates a batch of solve analyses into a ranked "what's actually costing
 * you the most time" report. A single analyzed solve tells you about that
 * one attempt; this looks across every solve you've bothered to analyze and
 * asks the more useful question — not "was this solve's OLL slow" but
 * "which OLL case keeps being slow."
 *
 * Ranked by *time*, not moves. For a sub-20 goal, two extra moves you turn
 * in 0.2s matter less than a 0.8s stare before the same PLL every time. So
 * each phase is charged:
 *
 *   extra moves × your own turning speed in that phase
 *   + every pause (≥ PAUSE_MS) inside it, including the one before its
 *     first move — that's recognition.
 *
 * With per-move timestamps (smart-cube solves) both parts are measured.
 * Without them, extra moves are priced at the solve's average time per move
 * and pauses are unknown, and the entry says it's an estimate.
 */

import type { SolveAnalysis } from "./analyze";
import type { PhaseId } from "./segment";
import { PAUSE_MS } from "@/lib/analytics/pause";

export interface WeaknessEntry {
  /** "Cross" / "F2L" / "OLL" / "PLL", or a case name like "T Perm" for the case-level report. */
  label: string;
  /** Estimated ms lost across every occurrence: extra moves priced at your turning speed, plus pauses. */
  lostMs: number;
  /** Of lostMs, the part from pausing to look. */
  pauseMs: number;
  /** Of lostMs, the part from extra moves. */
  extraMoveMs: number;
  /** Sum of extra moves (STM) versus the shortest available, across every occurrence. */
  totalLost: number;
  /** How many analyzed solves this label actually showed up in. */
  occurrences: number;
  /** lostMs / occurrences — the average cost each time it happens. */
  avgLostMs: number;
  /** totalLost / occurrences. */
  avgLost: number;
  /** Occurrences priced without per-move timing (pauses unknown, move cost from the solve's average pace). */
  estimated: number;
}

export interface WeaknessReport {
  analyzedCount: number;
  /** Analyses with real per-move timing. */
  timedCount: number;
  phases: WeaknessEntry[];
  cases: WeaknessEntry[];
}

export interface WeaknessInput {
  analysis: SolveAnalysis;
  /** Per-move ms from the solve's start, aligned with analysis.moves — smart-cube solves only. */
  moveTimestamps?: readonly number[];
}

const PHASE_DISPLAY_LABEL: Record<PhaseId, string> = {
  cross: "Cross",
  f2l: "F2L",
  oll: "OLL",
  pll: "PLL",
};

interface PhaseCost {
  extraMoveMs: number;
  pauseMs: number;
  lost: number;
  estimated: boolean;
}

/**
 * What each phase of one solve cost beyond the ideal. Phases partition the
 * solve's moves in order, so phase k covers the moves after phases 0..k-1.
 */
export function phaseCosts({ analysis, moveTimestamps }: WeaknessInput): PhaseCost[] {
  const t = moveTimestamps && moveTimestamps.length === analysis.moves.length ? moveTimestamps : null;
  const gaps = t ? t.map((x, i) => (i === 0 ? null : x - t[i - 1])) : null;
  const execMean = (from: number, to: number) => {
    const g = (gaps ?? []).slice(from, to).filter((x): x is number => x !== null && x > 0 && x < PAUSE_MS);
    return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
  };
  const solveExec = gaps ? execMean(0, gaps.length) : null;
  const avgPerMove = analysis.timeMs && analysis.moves.length ? analysis.timeMs / analysis.moves.length : null;

  let start = 0;
  return analysis.phases.map((phase) => {
    const end = start + phase.moves.length;
    const lost = phase.lost !== null && phase.lost > 0 ? phase.lost : 0;
    let cost: PhaseCost;
    if (gaps) {
      const pauseMs = gaps.slice(start, end).reduce<number>((a, g) => a + (g !== null && g >= PAUSE_MS ? g : 0), 0);
      const perTurn = execMean(start, end) ?? solveExec ?? 0;
      cost = { extraMoveMs: lost * perTurn, pauseMs, lost, estimated: false };
    } else {
      cost = { extraMoveMs: lost * (avgPerMove ?? 0), pauseMs: 0, lost, estimated: true };
    }
    start = end;
    return cost;
  });
}

type Totals = Map<string, { ms: number; pauseMs: number; extraMoveMs: number; lost: number; count: number; estimated: number }>;

function add(totals: Totals, label: string, c: PhaseCost) {
  const cur = totals.get(label) ?? { ms: 0, pauseMs: 0, extraMoveMs: 0, lost: 0, count: 0, estimated: 0 };
  totals.set(label, {
    ms: cur.ms + c.extraMoveMs + c.pauseMs,
    pauseMs: cur.pauseMs + c.pauseMs,
    extraMoveMs: cur.extraMoveMs + c.extraMoveMs,
    lost: cur.lost + c.lost,
    count: cur.count + 1,
    estimated: cur.estimated + (c.estimated ? 1 : 0),
  });
}

function toEntries(totals: Totals): WeaknessEntry[] {
  return [...totals.entries()]
    .map(([label, t]) => ({
      label,
      lostMs: t.ms,
      pauseMs: t.pauseMs,
      extraMoveMs: t.extraMoveMs,
      totalLost: t.lost,
      occurrences: t.count,
      avgLostMs: t.ms / t.count,
      avgLost: t.lost / t.count,
      estimated: t.estimated,
    }))
    .filter((e) => e.lostMs > 0 || e.totalLost > 0)
    .sort((a, b) => b.lostMs - a.lostMs || b.totalLost - a.totalLost);
}

/**
 * Builds the report from a set of successful analyses. Solves that failed to
 * analyze (a stale reconstruction that no longer matches its scramble, say)
 * are the caller's problem to filter out before this — this function only
 * ever sees analyses that actually completed.
 */
export function aggregateWeakness(inputs: readonly (SolveAnalysis | WeaknessInput)[]): WeaknessReport {
  const phaseTotals: Totals = new Map();
  const caseTotals: Totals = new Map();
  let timedCount = 0;

  for (const raw of inputs) {
    const input: WeaknessInput = "analysis" in raw ? raw : { analysis: raw };
    const { analysis } = input;
    if (!analysis.cfopShaped) continue;
    const costs = phaseCosts(input);
    if (costs.some((c) => !c.estimated)) timedCount++;

    // Phases are bucketed by kind (Cross/F2L/OLL/PLL), not by slot number —
    // "F2L 1" vs "F2L 3" is just solve order, not a case identity, so all
    // four F2L segments of a solve fold into one "F2L" bucket.
    const byPhaseKind = new Map<PhaseId, PhaseCost>();
    analysis.phases.forEach((phase, i) => {
      const c = costs[i];
      const cur = byPhaseKind.get(phase.phase);
      byPhaseKind.set(
        phase.phase,
        cur
          ? { extraMoveMs: cur.extraMoveMs + c.extraMoveMs, pauseMs: cur.pauseMs + c.pauseMs, lost: cur.lost + c.lost, estimated: cur.estimated && c.estimated }
          : c,
      );
      if ((phase.phase === "oll" || phase.phase === "pll") && phase.caseName && !phase.skipped && (c.lost > 0 || c.pauseMs > 0)) {
        add(caseTotals, phase.caseName, c);
      }
    });
    for (const [phaseId, c] of byPhaseKind) {
      if (c.lost > 0 || c.pauseMs > 0) add(phaseTotals, PHASE_DISPLAY_LABEL[phaseId], c);
    }
  }

  return {
    analyzedCount: inputs.length,
    timedCount,
    phases: toEntries(phaseTotals),
    cases: toEntries(caseTotals),
  };
}
