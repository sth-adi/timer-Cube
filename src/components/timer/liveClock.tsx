"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { liveElapsedMs } from "@/components/timer/liveClockMath";
import { rollingTps } from "@/lib/analysis/tps";
import { LiveTps } from "@/components/timer/LiveTps";
import { predictSolveTime } from "@/lib/analysis/prediction";
import { paceFromRatio, resetPerformanceAura, setPerformanceAura } from "@/lib/store/performanceAuraBus";
import { normalSolves } from "@/lib/stats/stats";
import type { EventTag, Solve } from "@/types";

/**
 * The live clock of a smart-cube solve, split out of SmartCubeTimer so a frame re-renders only the
 * handful of readouts that show the time, never the whole 1600-line screen.
 *
 * One requestAnimationFrame loop is shared by everything below and runs only while something is
 * subscribed (i.e. while a solve records). It's a plain external store, so the parent never
 * holds the per-frame time in state.
 */

let frameNow = 0;
let frameRaf: number | null = null;
const frameListeners = new Set<() => void>();

function frame() {
  frameNow = performance.now();
  for (const notify of frameListeners) notify();
  frameRaf = requestAnimationFrame(frame);
}

function subscribeFrame(notify: () => void) {
  frameListeners.add(notify);
  if (frameRaf === null) frameRaf = requestAnimationFrame(frame);
  return () => {
    frameListeners.delete(notify);
    if (frameListeners.size === 0 && frameRaf !== null) {
      cancelAnimationFrame(frameRaf);
      frameRaf = null;
      // Back to "no frame yet", so the next solve doesn't start from a stale reading.
      frameNow = 0;
    }
  };
}

const subscribeNever = () => () => {};
const getFrameNow = () => frameNow;
const getZero = () => 0;

/** A performance.now() reading refreshed every animation frame while `active`, and 0 otherwise (and before the first frame). */
export function useFrameNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribeFrame : subscribeNever, active ? getFrameNow : getZero, getZero);
}

/** Elapsed ms of the running solve, advancing every frame while `active`. See liveElapsedMs for the arithmetic. */
export function useLiveElapsedMs(active: boolean, startedAtMs: number | null, lastMoveMs: number): number {
  return liveElapsedMs(useFrameNow(active), startedAtMs, lastMoveMs);
}

/**
 * Runs `children` with the solve's elapsed ms (and the raw frame time) and re-renders only itself
 * each frame. Wrap exactly the readout that needs the time; everything else stays in the parent.
 */
export function LiveElapsed({
  active,
  startedAtMs,
  lastMoveMs,
  children,
}: {
  active: boolean;
  startedAtMs: number | null;
  lastMoveMs: number;
  children: (elapsedMs: number, nowMs: number) => ReactNode;
}) {
  const nowMs = useFrameNow(active);
  return <>{children(liveElapsedMs(nowMs, startedAtMs, lastMoveMs), nowMs)}</>;
}

/**
 * "N moves so far · X TPS — solve the cube to stop", live. Re-renders every frame on its own so the
 * speedometer slides with the clock instead of only updating when a move arrives.
 */
export function LiveMoveLine({ timestamps }: { timestamps: readonly number[] }) {
  const nowMs = useFrameNow(true);
  // How fast your hands are moving *right now*, not the whole-solve average: it slides with the
  // clock rather than sitting in fixed one-second buckets from the start.
  const liveTps = nowMs > 0 ? rollingTps(timestamps, nowMs) : null;
  return (
    <p className="text-sm text-muted">
      {timestamps.length} moves so far
      <LiveTps tps={liveTps} />
      {" — solve the cube to stop"}
    </p>
  );
}

/**
 * Feeds the ambient background's live pace cue (see AuroraBackground.tsx), the same signal
 * TimerView's keyboard solves already drive, so a live smart-cube attempt gets the same
 * running-ahead/behind atmosphere. Renders nothing; its per-frame write is the only reason it ticks.
 *
 * The target is the predictive model for this exact scramble, falling back to the plain PB, and is
 * frozen the instant recording starts (same reasoning as GhostPaceBar's own target).
 */
export function LiveAura({
  recording,
  startedAtMs,
  lastMoveMs,
  scramble,
  sessionSolves,
  eventPbMs,
  pendingEvent,
}: {
  recording: boolean;
  startedAtMs: number | null;
  lastMoveMs: number;
  scramble: string;
  sessionSolves: Solve[];
  eventPbMs: number | null;
  pendingEvent: EventTag | null;
}) {
  const elapsedMs = useLiveElapsedMs(recording, startedAtMs, lastMoveMs);
  const targetRef = useRef<number | null>(null);
  const prevRecordingRef = useRef(recording);

  useEffect(() => {
    if (recording && !prevRecordingRef.current) {
      // The predictive model is trained on ordinary 2-handed solves only, so it's only a fair
      // target when this attempt is one too: for a tagged event, eventPbMs (that event's own
      // best) is the right target outright, not a fallback behind an unrelated 2-handed estimate.
      const prediction = pendingEvent === null && scramble ? predictSolveTime(normalSolves(sessionSolves), scramble) : null;
      targetRef.current = (prediction?.skill?.useful ? prediction.predictedMs : null) ?? eventPbMs ?? null;
    }
    if (!recording) {
      targetRef.current = null;
      resetPerformanceAura();
    }
    prevRecordingRef.current = recording;
  }, [recording, scramble, sessionSolves, eventPbMs, pendingEvent]);

  useEffect(() => {
    if (!recording || targetRef.current === null) return;
    setPerformanceAura(paceFromRatio(elapsedMs, targetRef.current));
  }, [elapsedMs, recording]);

  useEffect(() => () => resetPerformanceAura(), []);

  return null;
}
