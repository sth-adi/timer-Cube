"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TimerMachine, type TimerPhase, type TimerResult } from "@/lib/timer/timerMachine";
import type { Penalty } from "@/types";

export type { TimerPhase, TimerResult } from "@/lib/timer/timerMachine";

export interface UseTimerOptions {
  inspectionEnabled: boolean;
  holdToStartMs: number;
  /**
   * How many phases to time the solve in. 1 is an ordinary timer; above that,
   * the first `phaseCount - 1` presses each mark a phase boundary and only the
   * last one stops the clock.
   */
  phaseCount?: number;
  /** Called once per finished attempt, with the inspection result and the penalty it earned. */
  onComplete: (result: TimerResult) => void;
}

export interface TimerEngine {
  phase: TimerPhase;
  displayMs: number;
  inspectionRemainingMs: number;
  /** The penalty a solve would get if it started now: "+2" past 15s of inspection, DNF past 17s. */
  pendingPenalty: Penalty;
  /** The finished attempt still on screen (phase "stopped"), including its inspection penalty. */
  lastResult: TimerResult | null;
  /** Cumulative times at each phase boundary marked so far, in ms. */
  splits: number[];
  /** Which phase is being timed right now, 0-based. */
  phaseIndex: number;
  /** keydown(space) / touchstart. */
  press: () => void;
  /** keyup(space) / touchend. */
  release: () => void;
  /** touchcancel / window blur: abandon a hold without starting the solve. */
  cancel: () => void;
  reset: () => void;
}

/**
 * React wrapper around TimerMachine (lib/timer/timerMachine.ts), which holds
 * all the rules — this hook only feeds it performance.now(), arms holds on
 * time, and re-renders on animation frames while something is changing.
 */
export function useTimer({ inspectionEnabled, holdToStartMs, phaseCount = 1, onComplete }: UseTimerOptions): TimerEngine {
  // One machine for the component's lifetime; it's mutated in place and the
  // view below is the rendered snapshot of it.
  const [machine] = useState(() => new TimerMachine({ inspectionEnabled, holdToStartMs, phaseCount }));
  const [view, setView] = useState(() => snapshot(machine, 0));

  useEffect(() => {
    machine.setOptions({ inspectionEnabled, holdToStartMs, phaseCount });
  }, [machine, inspectionEnabled, holdToStartMs, phaseCount]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const rafId = useRef<number | null>(null);
  const holdTimeoutId = useRef<number | null>(null);

  const sync = useCallback(() => {
    const now = performance.now();
    machine.tick(now);
    setView(snapshot(machine, now));
  }, [machine]);

  /** After any input: arm the hold on time, and animate while the clock or inspection is live. */
  const schedule = useCallback(() => {
    if (holdTimeoutId.current !== null) window.clearTimeout(holdTimeoutId.current);
    holdTimeoutId.current = null;
    const armAt = machine.armAt;
    if (armAt !== null) holdTimeoutId.current = window.setTimeout(sync, Math.max(0, armAt - performance.now()));
    if ((machine.phase === "running" || machine.inspecting) && rafId.current === null) {
      const loop = () => {
        sync();
        rafId.current = machine.phase === "running" || machine.inspecting ? requestAnimationFrame(loop) : null;
      };
      rafId.current = requestAnimationFrame(loop);
    }
  }, [machine, sync]);

  const press = useCallback(() => {
    const result = machine.press(performance.now());
    sync();
    schedule();
    if (result) onCompleteRef.current(result);
  }, [machine, sync, schedule]);

  const release = useCallback(() => {
    machine.release(performance.now());
    sync();
    schedule();
  }, [machine, sync, schedule]);

  const cancel = useCallback(() => {
    machine.cancel();
    sync();
    schedule();
  }, [machine, sync, schedule]);

  const reset = useCallback(() => {
    machine.reset();
    sync();
    schedule();
  }, [machine, sync, schedule]);

  useEffect(
    () => () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (holdTimeoutId.current !== null) window.clearTimeout(holdTimeoutId.current);
    },
    [],
  );

  return { ...view, phaseIndex: view.splits.length, press, release, cancel, reset };
}

function snapshot(m: TimerMachine, now: number) {
  return {
    phase: m.phase,
    displayMs: m.displayMs(now),
    inspectionRemainingMs: m.inspectionRemainingMs(now),
    pendingPenalty: m.pendingPenalty(now),
    lastResult: m.lastResult,
    splits: m.splits,
  };
}
