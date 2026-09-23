"use client";

import { useEffect } from "react";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useScrambleGuideStore } from "@/lib/store/scrambleGuideStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { Cube } from "@/lib/cube-engine/engine";
import { ScrambleGuide } from "@/lib/smartcube/scrambleGuide";

/** Past this many turns off the scramble, a fresh route from where the cube is beats undoing them one by one. */
export const MAX_UNDO = 6;

/**
 * Walks you through scrambling a smart cube: which step you're on, and —
 * the moment you make a wrong turn — exactly which turns undo it, shrinking
 * as you unwind them, before carrying on from the same step (see
 * lib/smartcube/scrambleGuide.ts for the rules).
 *
 * After every turn it checks its idea of the cube against the real one. If
 * a turn went unreported over Bluetooth, it measures the few turns back to
 * your current step and shows those as the undo. If the cube wasn't solved
 * when you started, or you wander more than MAX_UNDO turns away, it
 * re-plans instead: the shortest route from the cube as it really is to the
 * scramble's result.
 */
export function useScrambleGuide(scramble: string, active: boolean) {
  useEffect(() => {
    const store = useScrambleGuideStore;
    if (!active || !scramble) {
      store.setState({ scramble: null, status: "idle", rerouted: false, view: null });
      return undefined;
    }

    // All per-scramble: a new scramble (or leaving the scrambling screen) starts over.
    let guide: ScrambleGuide | null = null;
    /** The cube state the current steps start from. */
    let startFacelets = SOLVED_FACELETS;
    let planId = 0;

    const live = () => useSmartCubeStore.getState().liveFacelets;
    const start = (steps: string[], from: string, rerouted: boolean) => {
      guide = new ScrambleGuide(steps);
      startFacelets = from;
      store.setState({ scramble, status: "guiding", rerouted, view: guide.view() });
    };
    const plan = () => {
      const from = live();
      const id = ++planId;
      if (from === SOLVED_FACELETS) {
        start(scramble.split(/\s+/).filter(Boolean), from, false);
        return;
      }
      guide = null;
      store.setState({ scramble, status: "planning" });
      void getCubeEngineClient()
        .computeCorrectiveMoves(scramble, from)
        .then((steps) => {
          if (planId !== id) return;
          // Turned while this was being worked out: plan again from where it is now.
          if (live() !== from) plan();
          else start(steps, from, true);
        })
        .catch(() => {
          if (planId === id) store.setState({ status: "idle", view: null });
        });
    };

    // The guide and the real cube disagree (a turn went unreported). From a
    // solved start, measure the few turns back to the last completed step and
    // show them as an undo, keeping your place; if that's more than MAX_UNDO,
    // or the steps were already a route from an unsolved cube, re-plan.
    const resync = () => {
      const current = guide;
      if (!current || startFacelets !== SOLVED_FACELETS) {
        plan();
        return;
      }
      const from = live();
      const id = ++planId;
      const onTrack = current.steps.slice(0, current.view().index).join(" ");
      void getCubeEngineClient()
        .computeCorrectiveMoves(onTrack, from)
        .then((back) => {
          if (planId !== id || guide !== current) return;
          if (live() !== from) resync();
          else if (back.length > MAX_UNDO) plan();
          else store.setState({ view: current.resync(back) });
        })
        .catch(() => {
          if (planId === id) plan();
        });
    };

    plan();

    const unsubscribe = subscribeRawMoves(({ token }) => {
      const current = guide;
      if (!current) return;
      store.setState({ view: current.push(token) });
      // The store applies the move to the live cube right after announcing
      // it; check next tick that the guide still agrees with the real cube.
      window.setTimeout(() => {
        if (guide !== current) return;
        const expected = Cube.fromString(startFacelets);
        if (current.applied.length) expected.move(current.applied.join(" "));
        if (current.offBy > MAX_UNDO) plan();
        else if (expected.asString() !== live()) resync();
      }, 0);
    });

    return () => {
      unsubscribe();
      guide = null;
      planId++;
    };
  }, [scramble, active]);
}
