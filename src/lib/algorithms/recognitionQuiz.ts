/**
 * Question generation for the recognition trainer: given a case, builds a
 * multiple-choice question with plausible distractors rather than random
 * ones. Recognition is a genuinely different skill from execution — the
 * whole point of a flashcard-style quiz is testing whether you can *name*
 * the case fast, so the wrong answers need to be things you could actually
 * confuse it with, not just other items from the pool.
 */

import type { AlgCase, AlgGroup } from "./types";
import type { CaseProgress } from "./srs";

export interface RecognitionQuestion {
  case: AlgCase;
  /** Exactly 4 choices, shuffled, containing `case` exactly once. */
  choices: AlgCase[];
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks a random case from the pool, optionally restricted to one group. */
export function pickRandomCase(pool: readonly AlgCase[], group?: AlgGroup): AlgCase {
  const candidates = group ? pool.filter((c) => c.group === group) : pool;
  if (candidates.length === 0) throw new Error("No cases available to quiz on");
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * How much a case deserves to show up in a "focus weak cases" quiz, derived
 * from its SRS history rather than tracked separately — a case you keep
 * marking "again" (high lapses) or that's settled into a low ease is exactly
 * the kind of case slower recognition is actually costing you time on. A
 * never-seen case gets a modest flat weight (worth some practice, but a
 * genuinely struggled-with case should still come up more often than a
 * merely-new one).
 */
export function weakFocusWeight(progress: CaseProgress | undefined): number {
  if (!progress || progress.reps === 0) return 3;
  const easeWeakness = Math.max(0, 2.5 - progress.ease); // 0 (easy) up to ~1.2 (floor ease of 1.3)
  return 1 + progress.lapses * 3 + easeWeakness * 4;
}

/** Weighted-random pick from the pool — see weakFocusWeight for how weights are derived. */
export function pickWeightedCase(
  pool: readonly AlgCase[],
  weightOf: (caseId: string) => number,
  group?: AlgGroup,
): AlgCase {
  const candidates = group ? pool.filter((c) => c.group === group) : pool;
  if (candidates.length === 0) throw new Error("No cases available to quiz on");
  const weights = candidates.map((c) => Math.max(0.01, weightOf(c.id)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

const DISTRACTOR_COUNT = 3;

/**
 * Builds a 4-choice question for `correct`. Distractors always come from the
 * *same* group as the correct case — mixing OLL and PLL names into one
 * question would make it trivial to answer by shape alone, which tests
 * nothing. Within a group, same-shape-family cases (for OLL) are preferred
 * since those are the pairs people actually mix up; PLL cases have no shape
 * grouping, so its distractors are simply any other PLL.
 */
export function buildRecognitionQuestion(pool: readonly AlgCase[], correct: AlgCase): RecognitionQuestion {
  const sameGroup = pool.filter((c) => c.group === correct.group && c.id !== correct.id);
  const sameShape = correct.shape ? sameGroup.filter((c) => c.shape === correct.shape) : [];

  const pickedIds = new Set<string>();
  const distractors: AlgCase[] = [];
  for (const source of [sameShape, sameGroup]) {
    if (distractors.length >= DISTRACTOR_COUNT) break;
    for (const candidate of shuffle(source)) {
      if (distractors.length >= DISTRACTOR_COUNT) break;
      if (pickedIds.has(candidate.id)) continue;
      pickedIds.add(candidate.id);
      distractors.push(candidate);
    }
  }

  return { case: correct, choices: shuffle([correct, ...distractors]) };
}
