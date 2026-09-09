/**
 * Question generation for the recognition trainer: given a case, builds a
 * multiple-choice question with plausible distractors rather than random
 * ones. Recognition is a genuinely different skill from execution — the
 * whole point of a flashcard-style quiz is testing whether you can *name*
 * the case fast, so the wrong answers need to be things you could actually
 * confuse it with, not just other items from the pool.
 */

import type { AlgCase, AlgGroup } from "./types";

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
