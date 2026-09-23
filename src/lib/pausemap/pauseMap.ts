import type { CubeJSInstance } from "@/lib/cube-engine/engine";
import { f2lPairSolved } from "@/lib/solvers/oll";
import { crossSolved, replayStates } from "@/lib/xray/common";
import { pairSegments, type PairSegment } from "@/lib/blindspots/blindSpots";
import { PAUSE_MS } from "@/lib/analytics/pause";

/**
 * F2L Pause Map. Every pair of every smart-cube solve, split three ways:
 *
 *   finding   — the pause between the previous pair going in and your first
 *               turn on the next one (the hand-off lookahead should cover),
 *   stalls    — pauses of PAUSE_MS or more *inside* the pair, after you'd
 *               started it,
 *   turning   — everything else: the pair's turns themselves,
 *
 * plus how many turns it took against the fewest that pair needed from
 * where it was. Grouped by hand-off (cross → 1st pair, 1st → 2nd, …) it
 * tells "I couldn't find the next pair" apart from "I found it but took a
 * long way round", and says which hand-off costs you, how often.
 */

export const HANDOFF_LABELS = ["Cross → 1st pair", "1st → 2nd pair", "2nd → 3rd pair", "3rd → last pair"] as const;

/** Fewest pairs at a hand-off before it gets a verdict. */
export const MIN_PAIRS = 8;
/** Share of pairs whose finding pause reaches PAUSE_MS for that hand-off to count as a recurring stall. */
export const STALL_RATE = 0.4;
/** Average turns over the fewest possible before a hand-off counts as "found it, went the long way". */
export const EXTRA_TURNS = 3;

export interface SolveCapture {
  id: string;
  date: number;
  scramble: string;
  moves: string[];
  timesMs: number[];
}

export interface PairStretch extends PairSegment {
  solveId: string;
  date: number;
  /** Pauses (≥ PAUSE_MS) after the pair's first turn. */
  stallMs: number;
  /** Execution minus those stalls: the time spent actually turning. */
  turningMs: number;
  extraTurns: number;
  /** Where a drill of this hand-off should start: the previous milestone (-1 = the bare scramble), or fromIndex when that's unknown. */
  leadInIndex: number;
}

export function pairStretches(solve: SolveCapture): PairStretch[] {
  const segments = pairSegments({ scramble: solve.scramble, moves: solve.moves, timesMs: solve.timesMs });
  return segments.map((s) => {
    let stallMs = 0;
    for (let j = s.fromIndex + 2; j <= s.toIndex; j++) {
      const gap = solve.timesMs[j] - solve.timesMs[j - 1];
      if (gap >= PAUSE_MS) stallMs += gap;
    }
    // A drill of this hand-off starts one stretch earlier, so you finish the
    // previous pair (or the cross) yourself and have to look ahead.
    const prev = segments.find((p) => p.order === s.order - 1);
    const leadInIndex = s.order === 1 ? -1 : prev ? prev.fromIndex : s.fromIndex;
    return {
      ...s,
      solveId: solve.id,
      date: solve.date,
      stallMs,
      turningMs: s.execMs - stallMs,
      extraTurns: Math.max(0, s.turns - s.distance),
      leadInIndex,
    };
  });
}

export type Verdict = "finding" | "solution" | "fine";

export interface HandoffStat {
  order: 1 | 2 | 3 | 4;
  label: string;
  count: number;
  findMs: number;
  stallMs: number;
  turningMs: number;
  totalMs: number;
  turns: number;
  extraTurns: number;
  /** Share of pairs whose finding pause was a real stop (≥ PAUSE_MS). */
  stallRate: number;
  /** finding + stalls: time spent looking rather than turning, per pair. */
  lookingMs: number;
  verdict: Verdict | null;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function handoffStats(stretches: readonly PairStretch[]): HandoffStat[] {
  return ([1, 2, 3, 4] as const).map((order) => {
    const at = stretches.filter((s) => s.order === order);
    const findMs = mean(at.map((s) => s.findMs));
    const stallMs = mean(at.map((s) => s.stallMs));
    const totalMs = mean(at.map((s) => s.totalMs));
    const stallRate = at.length ? at.filter((s) => s.findMs >= PAUSE_MS).length / at.length : 0;
    const extraTurns = mean(at.map((s) => s.extraTurns));
    const lookingMs = findMs + stallMs;
    let verdict: Verdict | null = null;
    if (at.length >= MIN_PAIRS) {
      if (stallRate >= STALL_RATE && lookingMs >= totalMs * 0.35) verdict = "finding";
      else if (extraTurns >= EXTRA_TURNS) verdict = "solution";
      else verdict = "fine";
    }
    return {
      order,
      label: HANDOFF_LABELS[order - 1],
      count: at.length,
      findMs,
      stallMs,
      turningMs: mean(at.map((s) => s.turningMs)),
      totalMs,
      turns: mean(at.map((s) => s.turns)),
      extraTurns,
      stallRate,
      lookingMs,
      verdict,
    };
  });
}

export interface PauseMapReport {
  solves: number;
  pairs: number;
  handoffs: HandoffStat[];
  /** The hand-off with a verdict that costs the most looking time, if any isn't fine. */
  worst: HandoffStat | null;
  /** Real stalls at the worst hand-off, most recent first — the positions a drill replays. */
  examples: PairStretch[];
  stretches: PairStretch[];
  headline: string;
}

const s2 = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export function buildPauseMap(solves: readonly SolveCapture[]): PauseMapReport | null {
  const stretches = solves.flatMap(pairStretches);
  if (stretches.length === 0) return null;
  const handoffs = handoffStats(stretches);
  const flagged = handoffs.filter((h) => h.verdict && h.verdict !== "fine");
  const worst =
    [...flagged].sort((a, b) => (a.verdict === b.verdict ? b.lookingMs - a.lookingMs : a.verdict === "finding" ? -1 : 1))[0] ?? null;
  const examples = worst
    ? stretches.filter((s) => s.order === worst.order && (worst.verdict === "finding" ? s.findMs >= PAUSE_MS : s.extraTurns >= EXTRA_TURNS)).sort((a, b) => b.date - a.date)
    : [];

  let headline: string;
  if (!handoffs.some((h) => h.verdict)) {
    headline = `${stretches.length} pairs so far — each hand-off needs ${MIN_PAIRS} before it gets a verdict.`;
  } else if (!worst) {
    headline = "No hand-off stands out: you rarely stop between pairs, and you solve them close to the fewest turns.";
  } else if (worst.verdict === "finding") {
    headline = `${worst.label} is where your F2L stalls: you stop to look in ${Math.round(worst.stallRate * 100)}% of solves, ${s2(worst.lookingMs)} per pair on average before and during it. That's lookahead — track this pair while you finish the one before.`;
  } else {
    headline = `You find the pair at ${worst.label.toLowerCase()} quickly, then take the long way: ${worst.extraTurns.toFixed(1)} turns more than the fewest, on average. That's the solution, not your eyes.`;
  }

  return {
    solves: new Set(stretches.map((s) => s.solveId)).size,
    pairs: stretches.length,
    handoffs,
    worst,
    examples,
    stretches,
    headline,
  };
}

// ── drilling a hand-off ─────────────────────────────────────────────────

export interface HandoffDrill {
  order: number;
  /** Scramble plus your own moves up to where the drill starts, as one alg from solved. */
  setupAlg: string;
  /** Pairs solved (with the cross) at the moment of the hand-off in the original solve. */
  pairsAtHandoff: number;
  /** Whether you solve the previous stretch yourself first (a true lookahead drill) or start right at the hand-off. */
  leadIn: boolean;
  originalFindMs: number;
  originalTurns: number;
  fewestTurns: number;
}

const solvedCount = (c: CubeJSInstance) => [0, 1, 2, 3].filter((i) => f2lPairSolved(c, i as 0 | 1 | 2 | 3)).length;

/** Pairs in, counting only once the cross is solved (F2L pairs mean nothing before it). */
export const pairsIn = (c: CubeJSInstance) => (crossSolved(c) ? solvedCount(c) : -1);

export function drillFor(stretch: PairStretch, solve: SolveCapture): HandoffDrill {
  const { after } = replayStates(solve.scramble, solve.moves);
  const setupAlg = [solve.scramble, ...solve.moves.slice(0, stretch.leadInIndex + 1)].join(" ").trim();
  return {
    order: stretch.order,
    setupAlg,
    pairsAtHandoff: pairsIn(after[stretch.fromIndex]),
    leadIn: stretch.leadInIndex < stretch.fromIndex,
    originalFindMs: stretch.findMs,
    originalTurns: stretch.turns,
    fewestTurns: stretch.distance,
  };
}

export interface DrillResult {
  /** Pause from the previous pair going in to your next turn. */
  findMs: number;
  /** From the hand-off until the next pair was in. */
  totalMs: number;
  turns: number;
  /** Two pairs went in at once, so there was no hand-off to time. */
  multislot: boolean;
}

/**
 * Follows a live drill move by move. Before the hand-off you're finishing
 * the previous stretch; the hand-off is the move that brings the pairs-in
 * count to where the original solve had it; the next turn ends the
 * finding pause; the next pair going in ends the drill.
 */
export class HandoffTracker {
  private handoffAt: number | null;
  private firstTurnAt: number | null = null;
  private turns = 0;

  constructor(
    private readonly drill: Pick<HandoffDrill, "pairsAtHandoff" | "leadIn">,
    readyAtMs: number,
  ) {
    this.handoffAt = drill.leadIn ? null : readyAtMs;
  }

  get phase(): "lead-in" | "finding" | "solving" {
    return this.handoffAt === null ? "lead-in" : this.firstTurnAt === null ? "finding" : "solving";
  }

  /** Feed the cube's state after each move. Returns the result once the next pair is in. */
  move(cube: CubeJSInstance, atMs: number): DrillResult | null {
    const n = pairsIn(cube);
    if (this.handoffAt === null) {
      if (n > this.drill.pairsAtHandoff) return { findMs: 0, totalMs: 0, turns: 0, multislot: true };
      if (n === this.drill.pairsAtHandoff) this.handoffAt = atMs;
      return null;
    }
    this.turns++;
    if (this.firstTurnAt === null) this.firstTurnAt = atMs;
    if (n > this.drill.pairsAtHandoff) {
      return { findMs: this.firstTurnAt - this.handoffAt, totalMs: atMs - this.handoffAt, turns: this.turns, multislot: false };
    }
    return null;
  }
}

// ── did drilling help? ──────────────────────────────────────────────────

export interface DrillEffect {
  order: number;
  since: number;
  before: { pairs: number; findMs: number; stallRate: number };
  after: { pairs: number; findMs: number; stallRate: number };
  /** Enough real solves on both sides to compare. */
  enough: boolean;
}

/** Fewest pairs on each side before a before/after comparison is shown as a result. */
export const MIN_EFFECT_PAIRS = 10;

/**
 * Your real solves at that hand-off before you first drilled it versus
 * since — not the drills themselves, which are easier (you know a pair is
 * coming). Sample sizes are part of the answer.
 */
export function drillEffect(stretches: readonly PairStretch[], order: number, since: number): DrillEffect {
  const at = stretches.filter((s) => s.order === order);
  const side = (xs: PairStretch[]) => ({
    pairs: xs.length,
    findMs: mean(xs.map((s) => s.findMs)),
    stallRate: xs.length ? xs.filter((s) => s.findMs >= PAUSE_MS).length / xs.length : 0,
  });
  const before = side(at.filter((s) => s.date < since));
  const after = side(at.filter((s) => s.date >= since));
  return { order, since, before, after, enough: before.pairs >= MIN_EFFECT_PAIRS && after.pairs >= MIN_EFFECT_PAIRS };
}
