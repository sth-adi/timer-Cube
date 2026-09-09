/**
 * A small SM-2-style spaced repetition scheduler. Deliberately simple (no
 * separate "learning steps" sub-scheduler) — good enough for a case pool of
 * dozens of items reviewed a few times a week, not thousands of flashcards.
 */
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type CaseStatus = "new" | "learning" | "known";

export interface CaseProgress {
  caseId: string;
  ease: number;
  intervalDays: number;
  dueAt: number;
  reps: number;
  lapses: number;
  /**
   * Fastest recall — from seeing the case to revealing the algorithm — ever
   * recorded for it, in ms. This measures recognition + recall speed, not
   * physical execution (we can't observe turns on a real cube), so it's
   * deliberately named "recall" rather than "solve" throughout the UI.
   */
  bestRecallMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AGAIN_DELAY_MS = 10 * 60 * 1000;
const MIN_EASE = 1.3;
/** Intervals at or beyond this are considered "known" rather than still "learning". */
const KNOWN_INTERVAL_DAYS = 21;

export function initialProgress(caseId: string, now = Date.now()): CaseProgress {
  return { caseId, ease: 2.5, intervalDays: 0, dueAt: now, reps: 0, lapses: 0 };
}

export function deriveStatus(progress: CaseProgress | undefined): CaseStatus {
  if (!progress || progress.reps === 0) return "new";
  return progress.intervalDays >= KNOWN_INTERVAL_DAYS ? "known" : "learning";
}

export function isDue(progress: CaseProgress | undefined, now = Date.now()): boolean {
  if (!progress) return true;
  return progress.dueAt <= now;
}

/** Applies a self-rated review outcome, returning the new schedule. */
export function applyReview(progress: CaseProgress, rating: ReviewRating, now = Date.now()): CaseProgress {
  let { ease, intervalDays, lapses } = progress;
  const reps = progress.reps + 1;

  if (rating === "again") {
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalDays = 0;
    return { ...progress, ease, intervalDays, reps, lapses, dueAt: now + AGAIN_DELAY_MS };
  }

  if (rating === "hard") {
    ease = Math.max(MIN_EASE, ease - 0.15);
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 1.2));
  } else if (rating === "good") {
    intervalDays = intervalDays === 0 ? 1 : Math.round(intervalDays * ease);
  } else {
    ease = ease + 0.15;
    intervalDays = intervalDays === 0 ? 3 : Math.round(intervalDays * ease * 1.3);
  }

  return { ...progress, ease, intervalDays, reps, lapses, dueAt: now + intervalDays * DAY_MS };
}

/**
 * Applies a recall-time sample to a case's progress, updating its best only
 * when beaten. Pure so it's testable without the store, which is what
 * `algorithmStore.recordRecallTime` actually calls.
 */
export function applyRecallTime(progress: CaseProgress, ms: number): { progress: CaseProgress; isPB: boolean } {
  const isPB = progress.bestRecallMs === undefined || ms < progress.bestRecallMs;
  return { progress: isPB ? { ...progress, bestRecallMs: ms } : progress, isPB };
}
