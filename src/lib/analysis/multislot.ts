import type { Solve } from "@/types";
import { replayStates, crossSolved } from "@/lib/xray/common";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { avg } from "@/lib/analytics/solveMetrics";
import { analysisFrame } from "@/lib/smartcube/crossFrame";

/**
 * Multi-Slot Report: F2L Blind Spots (now the Pause Map) explicitly skips
 * any pair that went in together with another one — "pairs that went in
 * together (multislotting)... are left out". This is the other half of that
 * data: every time two or more pairs became solved by the same stretch of
 * moves, versus every time exactly one did, and whether the combined
 * stretches actually cost you less per pair or more.
 */

export interface InsertionEvent {
  /** How many pairs became solved together in this stretch — 1 for an ordinary single insertion. */
  pairs: number;
  turns: number;
  ms: number;
}

/**
 * Pure grouping: from the cumulative count of F2L pairs solved after each
 * move from `crossIdx` on, splits the solve into stretches between one
 * count increase and the next. No cube logic — just the counts and the
 * clock — so it's testable with hand-built data (see multislot.test.ts).
 */
export function groupInsertions(crossIdx: number, solvedCounts: readonly number[], timesMs: readonly number[]): InsertionEvent[] {
  const events: InsertionEvent[] = [];
  let prevIdx = crossIdx;
  let best = solvedCounts[crossIdx] ?? 0;
  for (let i = crossIdx + 1; i < solvedCounts.length; i++) {
    const now = solvedCounts[i];
    if (now <= best) continue;
    events.push({ pairs: now - best, turns: i - prevIdx, ms: timesMs[i] - timesMs[prevIdx] });
    best = now;
    prevIdx = i;
    if (best >= 4) break;
  }
  return events;
}

const solvedPairsCount = (cube: Parameters<typeof f2lPairSolved>[0]) => ([0, 1, 2, 3] as const).filter((i) => f2lPairSolved(cube, i)).length;

/** Replays one solve and groups its F2L into insertion events. [] if there's no cross to anchor from. */
export function f2lInsertionEvents(scramble: string, moves: readonly string[], timesMs: readonly number[]): InsertionEvent[] {
  if (moves.length === 0 || timesMs.length !== moves.length) return [];
  const { after } = replayStates(scramble, moves);
  const crossIdx = after.findIndex((c) => crossSolved(c));
  if (crossIdx < 0) return [];
  return groupInsertions(crossIdx, after.map(solvedPairsCount), timesMs);
}

export interface MultiSlotReport {
  soloEvents: number;
  multiEvents: number;
  /** Share of pairs that arrived as part of a multi-pair event, rather than solo. */
  multiPairShare: number;
  avgTurnsPerPairSolo: number;
  avgTurnsPerPairMulti: number;
  avgMsPerPairSolo: number;
  avgMsPerPairMulti: number;
  faster: "multi" | "solo" | null;
  headline: string;
}

/** Fewest total (solo + multi) events before a comparison means anything. */
export const MIN_EVENTS = 15;

const secs = (ms: number) => (ms / 1000).toFixed(2);

/**
 * Aggregates already-extracted events (see f2lInsertionEvents) into the
 * report — split out so the maths is testable without solves. Never
 * multi-slotting is itself a real finding, not a "not enough data" state,
 * so this only gates on total event count, not on multi.length being
 * nonzero — a report where every insertion was solo just skips the
 * faster/slower comparison.
 */
export function summarizeInsertions(events: readonly InsertionEvent[]): MultiSlotReport | null {
  const solo = events.filter((e) => e.pairs === 1);
  const multi = events.filter((e) => e.pairs >= 2);
  if (solo.length + multi.length < MIN_EVENTS) return null;

  const perPair = (list: readonly InsertionEvent[], key: "turns" | "ms") => avg(list.flatMap((e) => Array(e.pairs).fill(e[key] / e.pairs)));
  const avgTurnsPerPairSolo = perPair(solo, "turns");
  const avgTurnsPerPairMulti = perPair(multi, "turns");
  const avgMsPerPairSolo = perPair(solo, "ms");
  const avgMsPerPairMulti = perPair(multi, "ms");

  const totalPairs = events.reduce((s, e) => s + e.pairs, 0);
  const multiPairs = multi.reduce((s, e) => s + e.pairs, 0);
  const multiPairShare = totalPairs > 0 ? multiPairs / totalPairs : 0;

  const faster: MultiSlotReport["faster"] = multi.length === 0 ? null : avgMsPerPairMulti < avgMsPerPairSolo ? "multi" : avgMsPerPairSolo < avgMsPerPairMulti ? "solo" : null;

  const parts: string[] = [];
  if (multi.length === 0) {
    parts.push(`Every one of your ${solo.length} tracked F2L insertions has been solo — you don't multi-slot pairs.`);
  } else {
    parts.push(`${Math.round(multiPairShare * 100)}% of your F2L pairs arrive as part of a multi-pair insertion, the rest one at a time.`);
    if (faster === "multi") {
      parts.push(`Those combined stretches average ${secs(avgMsPerPairMulti)}s/pair versus ${secs(avgMsPerPairSolo)}s/pair solo — multi-slotting is genuinely saving you time.`);
    } else if (faster === "solo") {
      parts.push(`Those combined stretches average ${secs(avgMsPerPairMulti)}s/pair versus ${secs(avgMsPerPairSolo)}s/pair solo — the extra recognition is costing more than it saves.`);
    }
  }

  return { soloEvents: solo.length, multiEvents: multi.length, multiPairShare, avgTurnsPerPairSolo, avgTurnsPerPairMulti, avgMsPerPairSolo, avgMsPerPairMulti, faster, headline: parts.join(" ") };
}

export function analyzeMultiSlot(solves: readonly Solve[]): MultiSlotReport | null {
  const events = solves
    .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0 && s.penalty !== "dnf")
    .map(analysisFrame)
    .flatMap((s) => f2lInsertionEvents(s.scramble, s.reconstruction!.split(/\s+/).filter(Boolean), s.moveTimestamps!));
  return summarizeInsertions(events);
}
