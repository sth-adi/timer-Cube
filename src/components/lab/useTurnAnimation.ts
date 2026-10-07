"use client";

import { useEffect, useRef, useState } from "react";
import { applyTurn, inferTurn, turnToken, type TurnSpec } from "@/lib/cube-engine/stickerTurns";
import type { TurnState } from "./TurnCube";

export interface TurnView {
  /** The cube as it stands before `turning` (or just the cube, when nothing is turning). */
  facelets: string;
  turning: TurnState | null;
}

/** The quickest and slowest a turn is drawn when nothing is waiting behind it. */
export const MIN_TURN_MS = 70;
export const MAX_TURN_MS = 220;
/** A turn with no earlier move to measure against (the first of a run). */
export const FIRST_TURN_MS = 150;
/** The floor when turns are piling up: faster than a calm turn can be, but still a visible swing. */
export const RUSH_TURN_MS = 40;

/**
 * How long one turn takes to draw. It follows the real time since the previous move (`gapMs`, clamped to
 * MIN..MAX), so a fast alg looks fast and a slow, deliberate turn looks slow; the turn is drawn about as long
 * as the one before it was given, so each ends as the next begins. When more turns are `waiting` behind this
 * one it shortens further (down to RUSH_TURN_MS), so a burst of moves is caught up on rather than lagging
 * behind the real cube. `null` for no earlier move.
 */
export function turnDurationMs(gapMs: number | null, waiting: number): number {
  const base = gapMs === null || !Number.isFinite(gapMs) ? FIRST_TURN_MS : Math.min(MAX_TURN_MS, Math.max(MIN_TURN_MS, gapMs));
  if (waiting <= 0) return Math.round(base);
  return Math.max(RUSH_TURN_MS, Math.round(base * (1 - 0.25 * waiting)));
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface QueuedTurn {
  turn: TurnSpec;
  /** Time since the previous change to the target arrived, null for the first. */
  gapMs: number | null;
}

export interface TurnClock {
  /** The cube as drawn behind the turn in flight (all finished turns applied). */
  shown: string;
  active: { turn: TurnSpec; start: number; dur: number } | null;
  queue: QueuedTurn[];
}

/**
 * Moves the turn clock to `now` (ms on the animation-frame clock): finishes every turn whose time is up (a stalled
 * frame can span several), starting each next one where the last ended rather than a frame later, so a fast
 * stream never drifts behind, then leaves the turn in flight (or none). Turns are applied strictly in queue order.
 */
export function stepTurns(clock: TurnClock, now: number): TurnClock {
  let { shown, active } = clock;
  const queue = [...clock.queue];
  let startAt = now;
  for (;;) {
    if (!active) {
      const next = queue.shift();
      if (!next) break;
      active = { turn: next.turn, start: startAt, dur: turnDurationMs(next.gapMs, queue.length) };
    }
    if (now - active.start < active.dur) break;
    shown = applyTurn(shown, turnToken(active.turn));
    startAt = active.start + active.dur;
    active = null;
  }
  return { shown, active, queue };
}

/**
 * Turns a facelet string that keeps changing (a live cube) into what to draw: each single face turn
 * between one value and the next plays as a layer turning, queued in order and timed by the real gap since
 * the move before it (sped up if they pile up; see turnDurationMs). Any other change (a re-sync, a whole new
 * scramble) just snaps, and so does everything under reduced motion. However the turns were timed, the cube
 * ends on exactly the target. All state moves happen in animation frames, never during render or in the effect itself.
 */
export function useTurnAnimation(target: string): TurnView {
  const [view, setView] = useState<TurnView>({ facelets: target, turning: null });
  const lastTargetRef = useRef(target);
  const lastArrivalRef = useRef<number | null>(null);
  const shownRef = useRef(target);
  const queueRef = useRef<QueuedTurn[]>([]);
  const activeRef = useRef<{ turn: TurnSpec; start: number; dur: number } | null>(null);
  const snapRef = useRef(false);
  const rafRef = useRef(0);
  const frameRef = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    const frame = (now: number) => {
      rafRef.current = 0;
      if (snapRef.current) {
        // To the latest target, not the one that asked for the snap: turns that came after it were dropped with the queue.
        const to = lastTargetRef.current;
        snapRef.current = false;
        queueRef.current = [];
        activeRef.current = null;
        shownRef.current = to;
        setView({ facelets: to, turning: null });
        return;
      }
      const stepped = stepTurns({ shown: shownRef.current, active: activeRef.current, queue: queueRef.current }, now);
      shownRef.current = stepped.shown;
      activeRef.current = stepped.active;
      queueRef.current = stepped.queue;
      const active = stepped.active;
      if (!active) {
        // Settled: whatever the turns added up to, show the cube as it really is.
        shownRef.current = lastTargetRef.current;
        setView({ facelets: shownRef.current, turning: null });
        return;
      }
      setView({ facelets: shownRef.current, turning: { turn: active.turn, progress: (now - active.start) / active.dur } });
      rafRef.current = requestAnimationFrame(frameRef.current);
    };
    frameRef.current = frame;
  }, []);

  useEffect(() => {
    const previous = lastTargetRef.current;
    if (previous === target) return;
    lastTargetRef.current = target;
    const arrival = performance.now();
    const gapMs = lastArrivalRef.current === null ? null : arrival - lastArrivalRef.current;
    lastArrivalRef.current = arrival;
    const turn = prefersReducedMotion() ? null : inferTurn(previous, target);
    if (turn) queueRef.current.push({ turn, gapMs });
    else {
      snapRef.current = true;
      lastArrivalRef.current = null;
    }
    if (!rafRef.current) rafRef.current = requestAnimationFrame(frameRef.current);
  }, [target]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    },
    [],
  );

  return view;
}
