"use client";

import { useEffect, useRef, useState } from "react";
import { applyMove, inferMove, isFaceMove, moveToken, pairOf, type MoveSpec } from "@/lib/cube-engine/stickerTurns";
import { SLICE_PAIR_WINDOW_MS } from "@/lib/smartcube/slicePair";
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

/**
 * How long a face turn that arrives with nothing else going on waits for its other half before it starts. A
 * real M/E/S reaches the app as two opposite-face turns a moment apart; seeing the second before the first
 * has begun lets the pair play as one slice turn from the very start. Only the lone first turn of a run
 * waits; anything behind a turn in flight or in the queue never does.
 */
export const SLICE_HOLD_MS = 45;

/** How early in a turn its other half can still join it (the second layer then sets off late and they end together). */
const JOIN_UNTIL = 0.75;
/** A joined turn keeps at least this much of its duration still to run, so the late layer still visibly swings. */
const JOIN_MIN_REMAINING = 0.6;

export interface QueuedTurn {
  turn: MoveSpec;
  /** Time since the previous change to the target arrived, null for the first. */
  gapMs: number | null;
  /** On the animation-frame clock: do not start before this unless something has joined it (see SLICE_HOLD_MS). */
  holdUntil?: number;
}

export interface ActiveTurn {
  turn: MoveSpec;
  start: number;
  dur: number;
}

export interface TurnClock {
  /** The cube as drawn behind the turn in flight (all finished turns applied). */
  shown: string;
  active: ActiveTurn | null;
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
      const head = queue[0];
      if (!head) break;
      // A lone face turn that has only just arrived waits a moment for a possible other half of a slice turn.
      if (head.holdUntil !== undefined && now < head.holdUntil && queue.length === 1 && isFaceMove(head.turn)) break;
      queue.shift();
      active = { turn: head.turn, start: startAt, dur: turnDurationMs(head.gapMs, queue.length) };
    }
    if (now - active.start < active.dur) break;
    shown = applyMove(shown, moveToken(active.turn));
    startAt = active.start + active.dur;
    active = null;
  }
  return { shown, active, queue };
}

/**
 * Adds a move that has just arrived (`now`, same clock as the turns) to the clock. A face turn that is the
 * other half of a slice turn with the one before it (opposite faces turning the same way, within the
 * slice-pair window of it) is not a second turn: it joins the one before, which becomes a single pair turn,
 * whether that one is still waiting its turn or already under way (then the new layer sets off late and both
 * end together). Everything else is queued in order, held briefly if nothing else is going on (SLICE_HOLD_MS).
 * Pure: returns a new clock and leaves the one it was given alone.
 */
export function enqueueTurn(clock: TurnClock, incoming: QueuedTurn, now: number): TurnClock {
  const queue = [...clock.queue];
  const { active } = clock;
  const near = incoming.gapMs !== null && incoming.gapMs <= SLICE_PAIR_WINDOW_MS;
  if (near && isFaceMove(incoming.turn)) {
    const last = queue[queue.length - 1];
    if (last && isFaceMove(last.turn)) {
      const pair = pairOf(last.turn, incoming.turn);
      if (pair) {
        queue[queue.length - 1] = { turn: pair, gapMs: last.gapMs };
        return { shown: clock.shown, active, queue };
      }
    } else if (!last && active && isFaceMove(active.turn)) {
      const pair = pairOf(active.turn, incoming.turn);
      const p = Math.max(0, (now - active.start) / active.dur);
      if (pair && p < JOIN_UNTIL) {
        // Same progress now, but stretched so that enough is left to run for the late layer to be seen.
        const remaining = Math.max(active.dur * (1 - p), active.dur * JOIN_MIN_REMAINING);
        const dur = remaining / (1 - p);
        return { shown: clock.shown, active: { turn: { pair: pair.pair, lag: p }, start: now - p * dur, dur }, queue };
      }
    }
  }
  const idle = !active && queue.length === 0;
  queue.push(idle && isFaceMove(incoming.turn) ? { ...incoming, holdUntil: now + SLICE_HOLD_MS } : incoming);
  return { shown: clock.shown, active, queue };
}

/**
 * Turns a facelet string that keeps changing (a live cube) into what to draw: each single move
 * between one value and the next plays as layers turning (a face turn, a middle slice or whole-cube rotation, or
 * the two opposite-face turns a real M/E/S arrives as, which play as one slice turn; see enqueueTurn), queued
 * in order and timed by the real gap since the move before it (sped up if they pile up; see turnDurationMs). Any other change (a re-sync, a whole new
 * scramble) just snaps, and so does everything under reduced motion. However the turns were timed, the cube
 * ends on exactly the target. All state moves happen in animation frames, never during render or in the effect itself.
 */
export function useTurnAnimation(target: string): TurnView {
  const [view, setView] = useState<TurnView>({ facelets: target, turning: null });
  const lastTargetRef = useRef(target);
  const lastArrivalRef = useRef<number | null>(null);
  const shownRef = useRef(target);
  const queueRef = useRef<QueuedTurn[]>([]);
  const activeRef = useRef<ActiveTurn | null>(null);
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
      if (!active && queueRef.current.length > 0) {
        // Only a held first turn is left (waiting a moment for its other half): look again next frame.
        rafRef.current = requestAnimationFrame(frameRef.current);
        return;
      }
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
    const turn = prefersReducedMotion() ? null : inferMove(previous, target);
    if (turn) {
      const next = enqueueTurn({ shown: shownRef.current, active: activeRef.current, queue: queueRef.current }, { turn, gapMs }, arrival);
      activeRef.current = next.active;
      queueRef.current = next.queue;
    } else {
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
