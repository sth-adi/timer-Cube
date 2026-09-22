import { computeReplayGaps } from "./replayGaps";

/**
 * Turns a saved solve's real move-by-move timing into a playable rhythm-game
 * chart: one note per move, each due at the exact moment that move actually
 * happened during the original solve. Reuses the same gap computation the 3D
 * replay uses (computeReplayGaps) so a track "sounds like" the solve it came
 * from — same real pauses, same bursts — rather than a leveled-out tempo.
 */

export interface RhythmNote {
  index: number;
  token: string;
  /** Ms from track start this note is due — cumulative sum of the gaps up to and including this move. */
  hitAtMs: number;
}

export interface RhythmTrack {
  notes: RhythmNote[];
  /** Ms from track start to the last note — the chart's total length. */
  durationMs: number;
  /** True when built from the solve's own real per-move timestamps; false when only a leveled fallback cadence was available. */
  hasRealTiming: boolean;
}

export function buildRhythmTrack(reconstruction: string, moveTimestamps?: readonly number[]): RhythmTrack {
  const moves = reconstruction.trim().split(/\s+/).filter(Boolean);
  if (moves.length === 0) return { notes: [], durationMs: 0, hasRealTiming: false };

  const { gaps, hasRealTiming } = computeReplayGaps(moves, moveTimestamps);
  let cumulative = 0;
  const notes: RhythmNote[] = moves.map((token, index) => {
    cumulative += gaps[index];
    return { index, token, hitAtMs: cumulative };
  });

  return { notes, durationMs: cumulative, hasRealTiming };
}

export type HitJudgement = "perfect" | "good" | "miss";

/** Ms of allowed timing error either side of a note's due time. */
export const HIT_WINDOW_MS: Record<Exclude<HitJudgement, "miss">, number> = { perfect: 120, good: 260 };

export const HIT_POINTS: Record<HitJudgement, number> = { perfect: 300, good: 100, miss: 0 };

/** How much a hit's combo count is currently boosting its score, capped so a huge combo can't blow scores out of a sane range. */
function comboMultiplier(comboAfterThisHit: number): number {
  return 1 + Math.min(comboAfterThisHit, 50) * 0.02;
}

export function judgeHit(note: Pick<RhythmNote, "hitAtMs">, pressedAtMs: number): HitJudgement {
  const diff = Math.abs(pressedAtMs - note.hitAtMs);
  if (diff <= HIT_WINDOW_MS.perfect) return "perfect";
  if (diff <= HIT_WINDOW_MS.good) return "good";
  return "miss";
}

export interface RhythmScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  perfects: number;
  goods: number;
  misses: number;
}

export function initialScoreState(): RhythmScoreState {
  return { score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0 };
}

export function applyHit(state: RhythmScoreState, judgement: HitJudgement): RhythmScoreState {
  const combo = judgement === "miss" ? 0 : state.combo + 1;
  const points = judgement === "miss" ? 0 : Math.round(HIT_POINTS[judgement] * comboMultiplier(combo));
  return {
    score: state.score + points,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    perfects: state.perfects + (judgement === "perfect" ? 1 : 0),
    goods: state.goods + (judgement === "good" ? 1 : 0),
    misses: state.misses + (judgement === "miss" ? 1 : 0),
  };
}

export type Grade = "S" | "A" | "B" | "C" | "D";

/** A weighted accuracy (perfects count fully, goods count half, misses count for nothing) mapped onto a letter grade — S requires both near-perfect accuracy and a clean run (no misses at all), the way a real rhythm game's top rank usually does. */
export function gradeFor(state: RhythmScoreState, totalNotes: number): Grade {
  if (totalNotes === 0) return "D";
  const accuracy = (state.perfects + state.goods * 0.5) / totalNotes;
  if (accuracy >= 0.97 && state.misses === 0) return "S";
  if (accuracy >= 0.85) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.4) return "C";
  return "D";
}
