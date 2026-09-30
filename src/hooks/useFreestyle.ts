"use client";

import { useCallback, useEffect, useRef } from "react";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { resetFreestyleStore, useFreestyleStore } from "@/lib/store/freestyleStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { FREESTYLE_MIN_TURNS, FREESTYLE_STILL_MS, judgeShuffle } from "@/lib/smartcube/freestyle";

/**
 * Watches a smart cube being mixed up by hand and, once it's been turned
 * enough and left still, asks the solver worker for the solution to whatever
 * state it's in and hands `onCapture` the scramble that reaches it (see
 * lib/smartcube/freestyle.ts). `listening` is when a scramble is wanted at
 * all — connected, not mid-attempt.
 *
 * Returns `captureNow` (use the cube as it is, skipping the turn count and
 * the wait) and `useAnyway` (take a shuffle that was flagged as too easy).
 */
export function useFreestyle(enabled: boolean, listening: boolean, onCapture: (scramble: string) => void) {
  const captureRef = useRef(onCapture);
  useEffect(() => {
    captureRef.current = onCapture;
  });
  /** The scramble of a shuffle flagged "easy", held for useAnyway. */
  const easyScramble = useRef<string | null>(null);
  /** Re-runs the check; set by the effect below so the buttons can reach it. */
  const checkRef = useRef<((force: boolean) => void) | null>(null);

  useEffect(() => {
    if (!enabled || !listening) {
      resetFreestyleStore();
      return undefined;
    }
    useFreestyleStore.setState({ awaiting: true, status: "listening", turns: 0, easyMoves: null });
    easyScramble.current = null;

    let turns = 0;
    /** Bumped by every turn, so a slow solve for a state the cube has since left is discarded. */
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async (force: boolean) => {
      const live = useSmartCubeStore.getState().liveFacelets;
      if (live === SOLVED_FACELETS || (!force && turns < FREESTYLE_MIN_TURNS)) return;
      const id = ++generation;
      useFreestyleStore.setState({ status: "checking", easyMoves: null });
      try {
        const solution = await getCubeEngineClient().computeCorrectiveMoves("", live);
        if (id !== generation || useSmartCubeStore.getState().liveFacelets !== live) return;
        const verdict = judgeShuffle(live, solution);
        if (verdict.kind === "ok") {
          captureRef.current(verdict.scramble);
        } else if (verdict.kind === "easy") {
          easyScramble.current = verdict.scramble;
          useFreestyleStore.setState({ status: "easy", easyMoves: verdict.moves });
        } else {
          useFreestyleStore.setState({ status: "failed" });
        }
      } catch {
        if (id === generation) useFreestyleStore.setState({ status: "failed" });
      }
    };
    checkRef.current = (force) => void check(force);

    const unsubscribe = subscribeRawMoves(() => {
      turns++;
      generation++;
      easyScramble.current = null;
      if (timer) clearTimeout(timer);
      useFreestyleStore.setState({ turns, status: "listening", easyMoves: null });
      timer = setTimeout(() => void check(false), FREESTYLE_STILL_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      generation++;
      checkRef.current = null;
      resetFreestyleStore();
    };
  }, [enabled, listening]);

  const captureNow = useCallback(() => checkRef.current?.(true), []);
  const useAnyway = useCallback(() => {
    if (easyScramble.current) captureRef.current(easyScramble.current);
  }, []);
  return { captureNow, useAnyway };
}
