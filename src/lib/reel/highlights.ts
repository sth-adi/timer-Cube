import { solveFinalMs, type Solve } from "@/types";
import { buildReelTimeline, type ReelTimeline } from "./timeline";

/**
 * Highlight Reel: instead of filming one solve, scan a stretch of history,
 * pick the solves actually worth watching (new PBs, the fastest, the
 * fastest-turning, the most efficient) and lay them out end to end as one
 * montage — title card, each solve behind its own caption card, a finale.
 */

export type HighlightKind = "pb" | "fastest" | "tps" | "efficient";
export type HighlightPeriod = "week" | "month" | "all";

export interface Highlight {
  solve: Solve;
  kind: HighlightKind;
  /** Big caption on the card before the solve, e.g. "New PB". */
  caption: string;
  /** Supporting line under it, e.g. "5.8 TPS". */
  detail: string;
  finalMs: number;
  moves: number;
  tps: number;
}

export const PERIOD_MS: Record<HighlightPeriod, number> = { week: 7 * 864e5, month: 30 * 864e5, all: Infinity };
export const PERIOD_LABEL: Record<HighlightPeriod, string> = { week: "this week", month: "this month", all: "all time" };

const moveList = (s: Solve) => (s.reconstruction ?? "").split(/\s+/).filter(Boolean);

/** Solves that can be filmed: a verified reconstruction with real per-move timing, and not a DNF. */
export function filmable(s: Solve): boolean {
  return !!s.scramble && !!s.reconstruction && !!s.moveTimestamps?.length && solveFinalMs(s) !== null;
}

/**
 * Picks up to `max` highlights from `solves` in the period ending at `now`,
 * ordered for a montage: slowest first, so it builds to the fastest solve
 * as the finale. PBs are judged against *all* history (including solves
 * that can't be filmed), so "New PB" means what it says.
 */
export function pickHighlights(solves: readonly Solve[], opts: { now: number; period: HighlightPeriod; max?: number }): Highlight[] {
  const max = opts.max ?? 5;
  const since = opts.now - PERIOD_MS[opts.period];
  const where = PERIOD_LABEL[opts.period];

  // Running best over everything, to mark which filmable solves set a PB.
  const pbIds = new Set<string>();
  let best = Infinity;
  for (const s of [...solves].sort((a, b) => a.date - b.date)) {
    const f = solveFinalMs(s);
    if (f === null) continue;
    if (f < best) {
      best = f;
      pbIds.add(s.id);
    }
  }

  const pool = solves
    .filter((s) => filmable(s) && s.date >= since && s.date <= opts.now)
    .map((s) => {
      const finalMs = solveFinalMs(s)!;
      const moves = moveList(s).length;
      return { s, finalMs, moves, tps: moves / Math.max(0.001, s.timeMs / 1000) };
    });
  if (pool.length === 0) return [];

  const picked = new Map<string, Highlight>();
  const add = (e: (typeof pool)[number], kind: HighlightKind, caption: string, detail: string) => {
    if (picked.size >= max || picked.has(e.s.id)) return;
    picked.set(e.s.id, { solve: e.s, kind, caption, detail, finalMs: e.finalMs, moves: e.moves, tps: e.tps });
  };
  const detailOf = (e: (typeof pool)[number]) => `${e.moves} moves · ${e.tps.toFixed(1)} TPS`;

  const byTime = [...pool].sort((a, b) => a.finalMs - b.finalMs);
  // PBs first (the most recent are the most meaningful) — at most 3, so a streak of PBs
  // doesn't crowd out the fastest hands and the most efficient solve.
  for (const e of pool.filter((e) => pbIds.has(e.s.id)).sort((a, b) => b.s.date - a.s.date).slice(0, Math.min(3, max - 2))) add(e, "pb", "New PB", detailOf(e));
  if (byTime[0]) add(byTime[0], "fastest", `Fastest ${where}`, detailOf(byTime[0]));
  const byTps = [...pool].sort((a, b) => b.tps - a.tps);
  if (byTps[0]) add(byTps[0], "tps", "Fastest hands", `${byTps[0].tps.toFixed(1)} TPS · ${byTps[0].moves} moves`);
  const byMoves = [...pool].sort((a, b) => a.moves - b.moves);
  if (byMoves[0]) add(byMoves[0], "efficient", "Most efficient", `${byMoves[0].moves} moves · ${byMoves[0].tps.toFixed(1)} TPS`);
  for (const [i, e] of byTime.entries()) add(e, "fastest", i === 0 ? `Fastest ${where}` : `#${i + 1} ${where}`, detailOf(e));

  return [...picked.values()].sort((a, b) => b.finalMs - a.finalMs || a.solve.date - b.solve.date);
}

/** Card before each solve, the scrambled cube before its clock starts, the solved hold after it — shorter than a single reel's, a montage has to keep moving. */
export const OPENER_MS = 2200;
export const CARD_MS = 1400;
export const SEG_INTRO_MS = 700;
export const SEG_HOLD_MS = 1100;
export const FINALE_MS = 3000;

export interface MontageSegment {
  highlight: Highlight;
  timeline: ReelTimeline;
  /** Montage time at which this segment's caption card starts. */
  startMs: number;
  /** Montage time at which the solve's own clock reads 0. */
  solveStartMs: number;
  endMs: number;
}

export interface Montage {
  segments: MontageSegment[];
  totalMs: number;
  finaleStartMs: number;
}

export function buildMontage(highlights: readonly Highlight[]): Montage {
  const segments: MontageSegment[] = [];
  let t = OPENER_MS;
  for (const h of highlights) {
    const s = h.solve;
    const timeline = buildReelTimeline(s.scramble, moveList(s), s.moveTimestamps!, s.timeMs, s.rotations ?? [], s.gyroStream ?? null);
    const startMs = t;
    const solveStartMs = startMs + CARD_MS + SEG_INTRO_MS;
    const endMs = solveStartMs + timeline.totalMs + SEG_HOLD_MS;
    segments.push({ highlight: h, timeline, startMs, solveStartMs, endMs });
    t = endMs;
  }
  return { segments, finaleStartMs: t, totalMs: t + FINALE_MS };
}

export type MontageMoment =
  | { kind: "opener"; t: number }
  | { kind: "card"; index: number; t: number }
  | { kind: "solve"; index: number; /** Solve-relative time: negative during its short intro. */ t: number }
  | { kind: "finale"; t: number };

/** What the montage is showing at montage time `t`. */
export function montageAt(m: Montage, t: number): MontageMoment {
  if (t < OPENER_MS || m.segments.length === 0) return t < OPENER_MS ? { kind: "opener", t } : { kind: "finale", t: t - m.finaleStartMs };
  for (let i = 0; i < m.segments.length; i++) {
    const seg = m.segments[i];
    if (t >= seg.endMs) continue;
    if (t < seg.startMs + CARD_MS) return { kind: "card", index: i, t: t - seg.startMs };
    return { kind: "solve", index: i, t: t - seg.solveStartMs };
  }
  return { kind: "finale", t: t - m.finaleStartMs };
}

/** One sound in the montage's soundtrack, at montage time `atMs`. */
export interface SoundCue {
  atMs: number;
  kind: "beat" | "turn" | "card" | "finish" | "pb";
  /** Which face turned (turn cues only) — each face gets its own pitch, so a trigger sounds like a riff. */
  face?: string;
}

const BEAT_MS = 500;

/**
 * The soundtrack as a list of cues: a steady 120bpm pulse under the whole
 * thing, a whoosh on every caption card, a note on every single turn at
 * the moment it really happened (so a fast trigger sounds like a fast
 * riff and a lookahead pause goes quiet), and a chime — brighter for a
 * PB — as each clock stops.
 */
export function montageSoundtrack(m: Montage): SoundCue[] {
  const cues: SoundCue[] = [];
  for (let t = 0; t < m.totalMs; t += BEAT_MS) cues.push({ atMs: t, kind: "beat" });
  for (const seg of m.segments) {
    cues.push({ atMs: seg.startMs, kind: "card" });
    seg.timeline.moves.forEach((mv, i) => cues.push({ atMs: seg.solveStartMs + seg.timeline.timesMs[i], kind: "turn", face: mv[0] }));
    cues.push({ atMs: seg.solveStartMs + seg.timeline.totalMs, kind: seg.highlight.kind === "pb" ? "pb" : "finish" });
  }
  cues.push({ atMs: m.finaleStartMs, kind: "card" });
  return cues.sort((a, b) => a.atMs - b.atMs);
}

/** The same soundtrack for a single-solve reel (`introMs` of scrambled cube before the clock starts). */
export function reelSoundtrack(tl: ReelTimeline, introMs: number, pb = false): SoundCue[] {
  const cues: SoundCue[] = [];
  const total = introMs + tl.totalMs;
  for (let t = 0; t < total + 2000; t += BEAT_MS) cues.push({ atMs: t, kind: "beat" });
  tl.moves.forEach((mv, i) => cues.push({ atMs: introMs + tl.timesMs[i], kind: "turn", face: mv[0] }));
  cues.push({ atMs: total, kind: pb ? "pb" : "finish" });
  return cues.sort((a, b) => a.atMs - b.atMs);
}
