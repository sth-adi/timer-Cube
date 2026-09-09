"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TimerPhase = "idle" | "inspecting" | "holding" | "ready" | "running" | "stopped";

const INSPECTION_MS = 15_000;

export interface UseTimerOptions {
  inspectionEnabled: boolean;
  holdToStartMs: number;
  /**
   * How many phases to time the solve in. 1 is an ordinary timer; above that,
   * the first `phaseCount - 1` presses each mark a phase boundary and only the
   * last one stops the clock.
   */
  phaseCount?: number;
  onComplete: (timeMs: number, splits: number[]) => void;
}

export interface TimerEngine {
  phase: TimerPhase;
  displayMs: number;
  inspectionRemainingMs: number;
  /** Cumulative times at each phase boundary marked so far, in ms. */
  splits: number[];
  /** Which phase is being timed right now, 0-based. */
  phaseIndex: number;
  /** Call on keydown(space)/touchstart. */
  press: () => void;
  /** Call on keyup(space)/touchend. */
  release: () => void;
  reset: () => void;
}

/**
 * WCA-style timer state machine:
 *  idle -> (press) -> [inspecting if enabled] -> hold space -> after
 *  holdToStartMs turns "ready" (green) -> release -> running -> (press) ->
 *  stopped (records time).
 */
export function useTimer({
  inspectionEnabled,
  holdToStartMs,
  phaseCount = 1,
  onComplete,
}: UseTimerOptions): TimerEngine {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [displayMs, setDisplayMs] = useState(0);
  const [inspectionRemainingMs, setInspectionRemainingMs] = useState(INSPECTION_MS);
  const [splits, setSplits] = useState<number[]>([]);

  // Read inside press(), which must see the marks recorded by earlier presses
  // in the same solve without being re-created between them.
  const splitsRef = useRef<number[]>([]);

  const phaseRef = useRef<TimerPhase>("idle");
  const holdStartedAt = useRef<number | null>(null);
  const runStartedAt = useRef<number | null>(null);
  const inspectionStartedAt = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const holdTimeoutId = useRef<number | null>(null);

  const setPhaseBoth = (p: TimerPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearRaf = () => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };
  const clearHoldTimeout = () => {
    if (holdTimeoutId.current !== null) {
      window.clearTimeout(holdTimeoutId.current);
      holdTimeoutId.current = null;
    }
  };

  // Stored in refs (not plain useCallback) so the recursive rAF call below
  // doesn't self-reference a const in its own initializer. Assigned once in
  // an effect (never during render) — safe since they only close over other
  // refs and stable setState setters, never over changing props/state.
  const tickRunningRef = useRef<() => void>(() => {});
  const tickInspectionRef = useRef<() => void>(() => {});

  useEffect(() => {
    tickRunningRef.current = () => {
      if (phaseRef.current !== "running" || runStartedAt.current === null) return;
      setDisplayMs(performance.now() - runStartedAt.current);
      rafId.current = requestAnimationFrame(() => tickRunningRef.current());
    };
    tickInspectionRef.current = () => {
      if (phaseRef.current !== "inspecting" && phaseRef.current !== "holding" && phaseRef.current !== "ready") return;
      if (inspectionStartedAt.current === null) return;
      const remaining = INSPECTION_MS - (performance.now() - inspectionStartedAt.current);
      setInspectionRemainingMs(Math.max(0, remaining));
      rafId.current = requestAnimationFrame(() => tickInspectionRef.current());
    };
  }, []);

  const tickRunning = useCallback(() => tickRunningRef.current(), []);
  const tickInspection = useCallback(() => tickInspectionRef.current(), []);

  const press = useCallback(() => {
    const p = phaseRef.current;

    if (p === "running") {
      const elapsed = runStartedAt.current !== null ? performance.now() - runStartedAt.current : 0;

      // Mid-solve press with phases left to mark: record the boundary and keep
      // the clock running rather than stopping it.
      if (splitsRef.current.length < phaseCount - 1) {
        splitsRef.current = [...splitsRef.current, elapsed];
        setSplits(splitsRef.current);
        return;
      }

      clearRaf();
      setDisplayMs(elapsed);
      setPhaseBoth("stopped");
      onComplete(elapsed, splitsRef.current);
      return;
    }

    if (p === "stopped" || p === "idle") {
      // Clear the previous result now that a new attempt is actually
      // starting (it stayed on screen the whole time we sat at "stopped").
      setDisplayMs(0);
      splitsRef.current = [];
      setSplits([]);
      // First press: start inspection (if enabled) and arm with the full
      // hold delay — a deliberate anti-accidental-start safeguard for a
      // key that wasn't already being interacted with.
      if (inspectionEnabled) {
        inspectionStartedAt.current = performance.now();
        setInspectionRemainingMs(INSPECTION_MS);
        clearRaf();
        rafId.current = requestAnimationFrame(tickInspection);
      }
      holdStartedAt.current = performance.now();
      setPhaseBoth(inspectionEnabled ? "inspecting" : "holding");
      clearHoldTimeout();
      holdTimeoutId.current = window.setTimeout(() => {
        if (phaseRef.current === "holding" || phaseRef.current === "inspecting") {
          setPhaseBoth("ready");
        }
      }, holdToStartMs);
      return;
    }

    if (p === "inspecting") {
      // A *subsequent* press during inspection — the previous hold was
      // released before it armed, but the solver already deliberately
      // engaged once by starting inspection. Trust this tap and arm
      // instantly instead of requiring another full hold, so a quick
      // press/tap can interrupt inspection and jump straight to solving
      // without waiting out the remaining 15s.
      clearHoldTimeout();
      setPhaseBoth("ready");
      return;
    }
    // Already holding/ready: repeated keydown (auto-repeat) is a no-op.
  }, [inspectionEnabled, holdToStartMs, phaseCount, onComplete, tickInspection]);

  const release = useCallback(() => {
    const p = phaseRef.current;
    clearHoldTimeout();

    if (p === "ready") {
      clearRaf();
      runStartedAt.current = performance.now();
      setDisplayMs(0);
      setPhaseBoth("running");
      rafId.current = requestAnimationFrame(tickRunning);
      return;
    }

    if (p === "holding") {
      // No inspection in play, and released before it armed — back to idle.
      clearRaf();
      setPhaseBoth("idle");
      return;
    }

    // p === "inspecting": released before it armed. Inspection keeps
    // counting down; the next press (handled above) arms instantly.
  }, [tickRunning]);

  const reset = useCallback(() => {
    clearRaf();
    clearHoldTimeout();
    holdStartedAt.current = null;
    runStartedAt.current = null;
    inspectionStartedAt.current = null;
    setDisplayMs(0);
    setInspectionRemainingMs(INSPECTION_MS);
    splitsRef.current = [];
    setSplits([]);
    setPhaseBoth("idle");
  }, []);

  useEffect(() => () => {
    clearRaf();
    clearHoldTimeout();
  }, []);

  return {
    phase,
    displayMs,
    inspectionRemainingMs,
    splits,
    phaseIndex: splits.length,
    press,
    release,
    reset,
  };
}
