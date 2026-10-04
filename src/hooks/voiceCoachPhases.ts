/**
 * Which phase calls (cross / F2L / OLL) the Voice Coach still owes — pure, so
 * "a milestone on the very last move" is testable without React or a speech
 * engine.
 *
 * The store flips `recording` false in the same update that lands the last
 * milestone (a PLL skip, a solve finished by a turn correction), so a call
 * that only fires while `recording` is true would never be spoken. A call is
 * owed while the attempt is live: recording, or finished having been recorded.
 * An attempt that stops without finishing (aborted, cancelled, link dropped)
 * is dead and says nothing more.
 */

export interface PhaseCall {
  /** 0 = cross, 1 = F2L, 2 = OLL. */
  phase: 0 | 1 | 2;
  durationMs: number;
}

type PhaseKey = "cross" | "f2l" | "oll";

export interface PhaseTracker {
  /** The `startedAtMs` of the attempt being tracked — a different one is a new attempt. */
  attemptStartedAtMs: number | null;
  /** Whether the attempt is one this hook watched happen (so a finished solve already on screen at mount stays silent). */
  live: boolean;
  spoken: Record<PhaseKey, boolean>;
}

export interface PhaseTrackerInput {
  recording: boolean;
  finished: boolean;
  startedAtMs: number | null;
  crossAtMs: number | null;
  f2lAtMs: number | null;
  ollAtMs: number | null;
}

export function createPhaseTracker(initial: Pick<PhaseTrackerInput, "recording" | "startedAtMs">): PhaseTracker {
  return {
    attemptStartedAtMs: initial.startedAtMs,
    live: initial.recording,
    spoken: { cross: false, f2l: false, oll: false },
  };
}

/**
 * Advance the tracker by one render's worth of store state and return the
 * calls to speak now, in the order the cube reached them, each at most once
 * per attempt. With `speak` false (voice off) nothing is consumed while the
 * attempt is running, so switching it on mid-solve catches up.
 */
export function advancePhaseTracker(
  t: PhaseTracker,
  i: PhaseTrackerInput,
  speak: boolean,
): { newAttempt: boolean; calls: PhaseCall[] } {
  if (i.startedAtMs === null) {
    // Armed again, cancelled or aborted: nothing of the old attempt survives.
    t.attemptStartedAtMs = null;
    t.live = false;
    return { newAttempt: false, calls: [] };
  }
  let newAttempt = false;
  if (i.startedAtMs !== t.attemptStartedAtMs) {
    t.attemptStartedAtMs = i.startedAtMs;
    t.spoken = { cross: false, f2l: false, oll: false };
    t.live = true;
    newAttempt = true;
  }
  if (i.recording) t.live = true;
  else if (!i.finished) {
    // Stopped without finishing (aborted, link dropped): a later "it's solved" must not replay the splits.
    t.live = false;
    return { newAttempt, calls: [] };
  }
  const calls: PhaseCall[] = [];
  if (t.live && speak) {
    const start = i.startedAtMs;
    const phases = [
      { key: "cross", phase: 0, at: i.crossAtMs, from: start },
      { key: "f2l", phase: 1, at: i.f2lAtMs, from: i.crossAtMs ?? start },
      { key: "oll", phase: 2, at: i.ollAtMs, from: i.f2lAtMs ?? i.crossAtMs ?? start },
    ] as const;
    for (const p of phases) {
      if (p.at === null || t.spoken[p.key]) continue;
      t.spoken[p.key] = true;
      calls.push({ phase: p.phase, durationMs: p.at - p.from });
    }
  }
  // The finish is the last chance: whatever was called, the attempt is over.
  if (i.finished) t.live = false;
  return { newAttempt, calls };
}
