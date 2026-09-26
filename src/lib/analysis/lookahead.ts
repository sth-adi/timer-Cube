import type { Solve } from "@/types";
import { avg, quantile } from "@/lib/analytics/solveMetrics";
import { PAUSE_MS } from "@/lib/analytics/pause";
import { pairSegments } from "@/lib/blindspots/blindSpots";
import { analysisFrame } from "@/lib/smartcube/crossFrame";

/**
 * Lookahead Tradeoff: the classic F2L advice is "turn slower so you can
 * look ahead" — that a pair turned more calmly leaves you less to find
 * when it's done. This checks whether that's true for *you*: across every
 * back-to-back pair hand-off, is the pause before the next pair shorter
 * after a pair you turned slowly than after one you rushed — and is the
 * pause you save bigger than the turning time you spend to get it?
 */

export interface Handoff {
  /** Ms per turn while executing the pair before the hand-off. */
  prevMsPerTurn: number;
  prevTurns: number;
  /** The pause before the first turn of the next pair. */
  nextFindMs: number;
}

export interface LookaheadReport {
  handoffs: number;
  fastMsPerTurn: number;
  slowMsPerTurn: number;
  /** Pause before the next pair, after a rushed vs a calm pair. */
  pauseAfterFastMs: number;
  pauseAfterSlowMs: number;
  /** What turning calmly costs on a typical pair (extra ms per turn × turns). */
  slowdownCostMs: number;
  /** pauseAfterFast − pauseAfterSlow − slowdownCost, per hand-off: positive means turning calmly pays. */
  netGainMs: number;
  handoffsPerSolve: number;
  verdict: "slow-down" | "keep-pace" | "no-link";
  headline: string;
}

export const MIN_HANDOFFS = 30;
/** Net gain (either way) below this per hand-off is noise. */
const NOISE_MS = 40;

/** Every back-to-back pair hand-off in one solve: the pair just finished, and the pause before the next. */
export function solveHandoffs(raw: Solve): Handoff[] {
  if (!raw.scramble || !raw.reconstruction || !raw.moveTimestamps || raw.penalty === "dnf") return [];
  const solve = analysisFrame(raw) as Solve & { reconstruction: string; moveTimestamps: number[] };
  const moves = solve.reconstruction.split(/\s+/).filter(Boolean);
  const segs = pairSegments({ scramble: solve.scramble, moves, timesMs: solve.moveTimestamps });
  const t = solve.moveTimestamps;
  const out: Handoff[] = [];
  for (let k = 1; k < segs.length; k++) {
    const prev = segs[k - 1];
    const next = segs[k];
    if (next.fromIndex !== prev.toIndex) continue;
    // Turning pace only: a stop mid-pair is a look, not calm turning.
    const gaps: number[] = [];
    for (let i = prev.fromIndex + 2; i <= prev.toIndex; i++) {
      const g = t[i] - t[i - 1];
      if (g > 0 && g < PAUSE_MS) gaps.push(g);
    }
    if (gaps.length < 3) continue;
    out.push({ prevMsPerTurn: avg(gaps), prevTurns: gaps.length + 1, nextFindMs: next.findMs });
  }
  return out;
}

/** Pure: splits hand-offs at the median turning pace and compares what followed. */
export function summarizeLookahead(handoffs: readonly Handoff[], solveCount: number): LookaheadReport | null {
  if (handoffs.length < MIN_HANDOFFS || solveCount === 0) return null;
  const cut = quantile(
    handoffs.map((h) => h.prevMsPerTurn),
    0.5,
  );
  const fast = handoffs.filter((h) => h.prevMsPerTurn <= cut);
  const slow = handoffs.filter((h) => h.prevMsPerTurn > cut);
  if (fast.length < 10 || slow.length < 10) return null;

  const fastMsPerTurn = avg(fast.map((h) => h.prevMsPerTurn));
  const slowMsPerTurn = avg(slow.map((h) => h.prevMsPerTurn));
  const pauseAfterFastMs = avg(fast.map((h) => h.nextFindMs));
  const pauseAfterSlowMs = avg(slow.map((h) => h.nextFindMs));
  const typicalTurns = quantile(
    handoffs.map((h) => h.prevTurns),
    0.5,
  );
  const slowdownCostMs = (slowMsPerTurn - fastMsPerTurn) * (typicalTurns - 1);
  const netGainMs = pauseAfterFastMs - pauseAfterSlowMs - slowdownCostMs;
  const handoffsPerSolve = handoffs.length / solveCount;

  const pauseSaved = pauseAfterFastMs - pauseAfterSlowMs;
  const verdict: LookaheadReport["verdict"] = pauseSaved < NOISE_MS ? "no-link" : netGainMs >= NOISE_MS ? "slow-down" : "keep-pace";
  const s = (ms: number) => (ms / 1000).toFixed(2);
  const headline =
    verdict === "slow-down"
      ? `After a pair you turn calmly, you pause ${s(pauseSaved)}s less before the next one — more than the ${s(slowdownCostMs)}s the calmer turning costs. Slowing down to look ahead would net you about ${s(netGainMs * handoffsPerSolve)}s a solve.`
      : verdict === "keep-pace"
        ? `Turning calmly does shorten your next pause (by ${s(pauseSaved)}s), but it costs ${s(slowdownCostMs)}s to do — for you, it doesn't pay yet. Work on spotting the next pair while turning at your normal pace.`
        : `Your pause before the next pair is about the same (${s(pauseAfterSlowMs)}s vs ${s(pauseAfterFastMs)}s) whether you rushed the pair before it or not — you aren't looking ahead while turning, at any speed. That's the habit to build.`;

  return { handoffs: handoffs.length, fastMsPerTurn, slowMsPerTurn, pauseAfterFastMs, pauseAfterSlowMs, slowdownCostMs, netGainMs, handoffsPerSolve, verdict, headline };
}

export function analyzeLookahead(solves: readonly Solve[]): LookaheadReport | null {
  const per = solves.map(solveHandoffs);
  return summarizeLookahead(per.flat(), per.filter((h) => h.length > 0).length);
}
