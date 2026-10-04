"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import type { PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { INSPECTION_CALLS, finishCallout, say, silence, splitCallout } from "@/lib/smartcube/voiceCoach";
import type { Penalty } from "@/types";
import { advancePhaseTracker, createPhaseTracker } from "@/hooks/voiceCoachPhases";

interface VoiceCoachInput {
  recording: boolean;
  finished: boolean;
  startedAtMs: number | null;
  crossAtMs: number | null;
  f2lAtMs: number | null;
  ollAtMs: number | null;
  solvedAtMs: number | null;
  /** The penalty the finished solve carries (inspection overrun). */
  penalty: Penalty;
  baseline: PostSolveBaseline | null;
  /** Your best for this event right now — sampled when the solve starts, so the solve being called never counts against itself. */
  bestMs: number | null;
  inspecting: boolean;
  inspectionRemainingMs: number;
}

/**
 * The Voice Coach: calls each phase as the cube completes it, the time when
 * you stop, and (in full mode) the inspection marks and a PB. Everything
 * it says is driven off the same store fields the on-screen splits read, so
 * what you hear is what the screen shows.
 */
export function useVoiceCoach(o: VoiceCoachInput): void {
  const mode = useSettingsStore((s) => s.voiceCoach);
  const tracker = useRef(createPhaseTracker({ recording: o.recording, startedAtMs: o.startedAtMs }));
  const priorBest = useRef<number | null>(null);
  const prevFinished = useRef(o.finished);
  const inspectionSpoken = useRef<Set<number>>(new Set());

  // Phase calls in the order the cube reaches them, and the finish. They share
  // one effect because a milestone on the last move arrives in the same update
  // as the finish, and the finish cuts in front of anything still queued — so
  // the missed calls go out inside the finish utterance, not before it.
  const { recording, finished, startedAtMs, crossAtMs, f2lAtMs, ollAtMs, solvedAtMs, penalty, baseline, bestMs } = o;
  useEffect(() => {
    const { newAttempt, calls } = advancePhaseTracker(
      tracker.current,
      { recording, finished, startedAtMs, crossAtMs, f2lAtMs, ollAtMs },
      mode !== "off",
    );
    // A new attempt: pin the best to beat.
    if (newAttempt) priorBest.current = bestMs;
    const finishing = finished && !prevFinished.current;
    prevFinished.current = finished;
    if (mode === "off") return;
    const lines = calls.map((c) =>
      splitCallout({
        phase: c.phase,
        durationMs: c.durationMs,
        mode,
        baseline: baseline?.phases[c.phase] ?? null,
      }),
    );
    if (finishing && startedAtMs !== null && solvedAtMs !== null) {
      const pllMs = ollAtMs !== null ? solvedAtMs - ollAtMs : null;
      lines.push(
        finishCallout({
          timeMs: solvedAtMs - startedAtMs,
          penalty,
          mode,
          pllMs,
          baseline: baseline?.phases[3] ?? null,
          priorBestMs: priorBest.current,
        }),
      );
      say(lines.join(". "), { interrupt: true });
    } else {
      for (const line of lines) say(line);
    }
  }, [mode, recording, finished, startedAtMs, crossAtMs, f2lAtMs, ollAtMs, solvedAtMs, penalty, baseline, bestMs]);

  // WCA inspection marks — full mode only.
  useEffect(() => {
    if (!o.inspecting) {
      inspectionSpoken.current = new Set();
      return;
    }
    if (mode !== "full") return;
    for (const call of INSPECTION_CALLS) {
      if (o.inspectionRemainingMs <= call.atRemainingMs && !inspectionSpoken.current.has(call.atRemainingMs)) {
        inspectionSpoken.current.add(call.atRemainingMs);
        say(call.text, { interrupt: true, rate: 1 });
      }
    }
  }, [mode, o.inspecting, o.inspectionRemainingMs]);

  // Switching it off, or leaving the timer, shouldn't leave a sentence hanging.
  useEffect(() => {
    if (mode === "off") silence();
  }, [mode]);
  useEffect(() => () => silence(), []);
}
