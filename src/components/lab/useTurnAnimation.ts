"use client";

import { useEffect, useRef, useState } from "react";
import { applyTurn, inferTurn, turnToken, type TurnSpec } from "@/lib/cube-engine/stickerTurns";
import type { TurnState } from "./TurnCube";

export interface TurnView {
  /** The cube as it stands before `turning` (or just the cube, when nothing is turning). */
  facelets: string;
  turning: TurnState | null;
}

/** How long one turn takes, shorter the more are waiting — a fast solve's turns come faster than a slow one can be drawn, so they speed up rather than fall behind. */
export function turnDurationMs(waiting: number): number {
  if (waiting >= 3) return 40;
  if (waiting === 2) return 70;
  if (waiting === 1) return 100;
  return 150;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Turns a facelet string that keeps changing (a live cube) into what to draw: each single face turn
 * between one value and the next plays as a layer turning, queued and sped up if they pile up. Any
 * other change (a re-sync, a whole new scramble) just snaps, and so does everything under reduced motion.
 * All state moves happen in animation frames, never during render or in the effect itself.
 */
export function useTurnAnimation(target: string): TurnView {
  const [view, setView] = useState<TurnView>({ facelets: target, turning: null });
  const lastTargetRef = useRef(target);
  const shownRef = useRef(target);
  const queueRef = useRef<TurnSpec[]>([]);
  const activeRef = useRef<{ turn: TurnSpec; start: number; dur: number } | null>(null);
  const snapRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    const frame = (now: number) => {
      rafRef.current = 0;
      if (snapRef.current !== null) {
        const to = snapRef.current;
        snapRef.current = null;
        queueRef.current = [];
        activeRef.current = null;
        shownRef.current = to;
        setView({ facelets: to, turning: null });
        return;
      }
      let active = activeRef.current;
      if (!active && queueRef.current.length > 0) {
        const turn = queueRef.current.shift()!;
        active = { turn, start: now, dur: turnDurationMs(queueRef.current.length) };
        activeRef.current = active;
      }
      if (!active) return;
      const progress = (now - active.start) / active.dur;
      if (progress >= 1) {
        shownRef.current = applyTurn(shownRef.current, turnToken(active.turn));
        activeRef.current = null;
        if (queueRef.current.length === 0) {
          // Settled: whatever the turns added up to, show the cube as it really is.
          shownRef.current = lastTargetRef.current;
          setView({ facelets: shownRef.current, turning: null });
          return;
        }
        setView({ facelets: shownRef.current, turning: null });
        rafRef.current = requestAnimationFrame(frameRef.current);
        return;
      }
      setView({ facelets: shownRef.current, turning: { turn: active.turn, progress } });
      rafRef.current = requestAnimationFrame(frameRef.current);
    };
    frameRef.current = frame;
  }, []);

  useEffect(() => {
    const previous = lastTargetRef.current;
    if (previous === target) return;
    lastTargetRef.current = target;
    const turn = prefersReducedMotion() ? null : inferTurn(previous, target);
    if (turn) queueRef.current.push(turn);
    else snapRef.current = target;
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
