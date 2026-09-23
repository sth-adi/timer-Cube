import { Cube } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { crossSolved } from "@/lib/xray/common";

/**
 * Tempo Trainer: metronome solving — the classic drill for smooth,
 * pause-free turning and lookahead — made measurable. Every physical turn
 * is scored against the nearest click, every beat that passed without a
 * turn is a missed beat, and missed beats are attributed to the phase you
 * were in, so the report says not just "you paused" but "you lose beats
 * finding F2L pairs, not executing algorithms".
 */

export type TempoJudgement = "perfect" | "good" | "off";

export interface TempoTurn {
  /** Ms since the metronome's beat 0. */
  atMs: number;
  beat: number;
  /** Signed offset from that beat (negative = early). */
  offsetMs: number;
  judgement: TempoJudgement;
}

export interface TempoGap {
  fromBeat: number;
  beats: number;
  phase: string;
}

export interface TempoReport {
  bpm: number;
  turns: TempoTurn[];
  /** Beats from the first turn's beat to the last's. */
  beats: number;
  /** Share of those beats that had a turn on them. */
  smoothness: number;
  /** Mean |offset| as a share of the beat (0 = dead on). */
  meanOffset: number;
  counts: Record<TempoJudgement, number>;
  gaps: TempoGap[];
  /** Missed beats per phase. */
  missedByPhase: Record<string, number>;
  longestGap: number;
  suggestedBpm: number;
}

/** Offset (as a share of the beat) inside which a turn counts as on it. */
export const PERFECT_WINDOW = 0.12;
export const GOOD_WINDOW = 0.25;

/** The CFOP phase each move belongs to, replayed from the state the session started in. */
export function phaseLabels(startFacelets: string, moves: readonly string[]): string[] {
  const cube = Cube.fromString(startFacelets);
  const labels: string[] = [];
  let phase = crossSolved(cube) ? (bottomLayerSolved(cube) ? (orientationSolved(cube) ? "PLL" : "OLL") : "F2L") : "Cross";
  for (const m of moves) {
    labels.push(phase);
    cube.move(m);
    if (phase === "Cross" && crossSolved(cube)) phase = "F2L";
    if (phase === "F2L" && bottomLayerSolved(cube)) phase = "OLL";
    if (phase === "OLL" && bottomLayerSolved(cube) && orientationSolved(cube)) phase = "PLL";
  }
  return labels;
}

export function analyzeTempo(turnTimesMs: readonly number[], bpm: number, phases: readonly string[] = []): TempoReport | null {
  if (turnTimesMs.length === 0) return null;
  const period = 60000 / bpm;
  const turns: TempoTurn[] = turnTimesMs.map((atMs) => {
    const beat = Math.round(atMs / period);
    const offsetMs = atMs - beat * period;
    const share = Math.abs(offsetMs) / period;
    return { atMs, beat, offsetMs, judgement: share <= PERFECT_WINDOW ? "perfect" : share <= GOOD_WINDOW ? "good" : "off" };
  });

  const first = turns[0].beat;
  const last = turns[turns.length - 1].beat;
  const beats = last - first + 1;
  const covered = new Set(turns.map((t) => t.beat));
  const gaps: TempoGap[] = [];
  const missedByPhase: Record<string, number> = {};
  let run = 0;
  for (let b = first; b <= last; b++) {
    if (covered.has(b)) {
      if (run > 0) {
        // Attribute the gap to the phase of the turn that ended it.
        const nextTurn = turns.findIndex((t) => t.beat === b);
        const phase = phases[nextTurn] ?? "Solve";
        gaps.push({ fromBeat: b - run, beats: run, phase });
        missedByPhase[phase] = (missedByPhase[phase] ?? 0) + run;
      }
      run = 0;
    } else run++;
  }

  const counts: Record<TempoJudgement, number> = { perfect: 0, good: 0, off: 0 };
  for (const t of turns) counts[t.judgement]++;
  const smoothness = covered.size / beats;
  const meanOffset = turns.reduce((s, t) => s + Math.abs(t.offsetMs), 0) / turns.length / period;
  const onBeat = (counts.perfect + counts.good) / turns.length;
  const factor = smoothness >= 0.9 && onBeat >= 0.75 ? 1.1 : smoothness < 0.7 ? 0.9 : 1;
  return {
    bpm,
    turns,
    beats,
    smoothness,
    meanOffset,
    counts,
    gaps,
    missedByPhase,
    longestGap: gaps.reduce((m, g) => Math.max(m, g.beats), 0),
    suggestedBpm: Math.max(30, Math.round((bpm * factor) / 5) * 5),
  };
}
