"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import type { PostSolveBaseline } from "@/lib/analysis/postSolveBaseline";
import { INSPECTION_CALLS, finishCallout, say, silence, splitCallout } from "@/lib/smartcube/voiceCoach";
import type { Penalty } from "@/types";

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
  const spoken = useRef({ cross: false, f2l: false, oll: false });
  const priorBest = useRef<number | null>(null);
  const prevRecording = useRef(false);
  const prevFinished = useRef(o.finished);
  const inspectionSpoken = useRef<Set<number>>(new Set());

  // A new attempt: forget what was called last time and pin the best to beat.
  useEffect(() => {
    if (o.recording && !prevRecording.current) {
      spoken.current = { cross: false, f2l: false, oll: false };
      priorBest.current = o.bestMs;
    }
    prevRecording.current = o.recording;
  }, [o.recording, o.bestMs]);

  // Phase calls, in the order the cube reaches them.
  useEffect(() => {
    if (mode === "off" || !o.recording || o.startedAtMs === null) return;
    const start = o.startedAtMs;
    const phases = [
      { key: "cross", phase: 0, at: o.crossAtMs, from: start },
      { key: "f2l", phase: 1, at: o.f2lAtMs, from: o.crossAtMs ?? start },
      { key: "oll", phase: 2, at: o.ollAtMs, from: o.f2lAtMs ?? o.crossAtMs ?? start },
    ] as const;
    for (const p of phases) {
      if (p.at === null || spoken.current[p.key]) continue;
      spoken.current[p.key] = true;
      say(splitCallout({ phase: p.phase, durationMs: p.at - p.from, mode, baseline: o.baseline?.phases[p.phase] ?? null }));
    }
  }, [mode, o.recording, o.startedAtMs, o.crossAtMs, o.f2lAtMs, o.ollAtMs, o.baseline]);

  // The finish cuts in front of anything still queued.
  useEffect(() => {
    if (o.finished && !prevFinished.current && mode !== "off" && o.startedAtMs !== null && o.solvedAtMs !== null) {
      const pllMs = o.ollAtMs !== null ? o.solvedAtMs - o.ollAtMs : null;
      say(
        finishCallout({
          timeMs: o.solvedAtMs - o.startedAtMs,
          penalty: o.penalty,
          mode,
          pllMs,
          baseline: o.baseline?.phases[3] ?? null,
          priorBestMs: priorBest.current,
        }),
        { interrupt: true },
      );
    }
    prevFinished.current = o.finished;
  }, [o.finished, mode, o.startedAtMs, o.solvedAtMs, o.ollAtMs, o.penalty, o.baseline]);

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
