"use client";

import { useCallback, useRef } from "react";
import type { TimerResult } from "@/lib/timer/timerMachine";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useHeartRateStore } from "@/lib/store/heartRateStore";
import { playSolveChime } from "@/lib/utils/sound";
import type { EventTag } from "@/types";

/**
 * What happens when a keyboard/touch attempt starts and finishes — kept out
 * of TimerView so the display code doesn't also own how a solve is saved.
 *
 * The scramble and event tag are captured when the attempt *starts*: the
 * next scramble is generated asynchronously after each solve, and if it
 * lands mid-attempt the solve must still be saved with the scramble that
 * was on screen when you scrambled the cube, not the one showing at the end.
 */
export function useSolveCompletion() {
  const attempt = useRef<{ scramble: string; event: EventTag | null } | null>(null);

  const onStart = useCallback(() => {
    attempt.current = {
      scramble: useScrambleStore.getState().scramble,
      event: useSessionStore.getState().pendingEvent,
    };
  }, []);

  const onComplete = useCallback(({ timeMs, splits, penalty }: TimerResult) => {
    const { scramble, event } = attempt.current ?? {
      scramble: useScrambleStore.getState().scramble,
      event: useSessionStore.getState().pendingEvent,
    };
    attempt.current = null;
    // The keyboard timer carries an elapsed duration, not a start timestamp,
    // so "now minus that duration" anchors the heart-rate window — a few ms
    // of latency is nothing next to a multi-second bpm sampling interval.
    const heartRate = useHeartRateStore.getState().summarize(Date.now() - timeMs) ?? undefined;
    // The inspection penalty (+2 past 15s, DNF past 17s) is saved with the
    // solve itself, so stats treat it exactly like a penalty added by hand.
    useSessionStore
      .getState()
      .recordSolve(timeMs, scramble, splits, event ?? undefined, undefined, heartRate, undefined, undefined, undefined, penalty);
    if (useSettingsStore.getState().soundEnabled) playSolveChime();
    void useScrambleStore.getState().nextScramble();
  }, []);

  return { onStart, onComplete };
}
