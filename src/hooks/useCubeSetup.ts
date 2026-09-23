"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { RouteTracker } from "@/lib/smartcube/route";

export interface SetupRoute {
  turns: string[];
  position: number;
  partial: boolean;
}

/**
 * Walks the cube in your hands to a target scramble: a route of turns it
 * checks off as you make them, recalculated from wherever the cube really
 * is if you go off it. `onReady` fires the moment the cube matches.
 */
export function useCubeSetup(onReady: () => void) {
  const [route, setRoute] = useState<SetupRoute | null>(null);
  const activeRef = useRef(false);
  const targetRef = useRef("");
  const trackerRef = useRef<RouteTracker | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const complete = useCallback(() => {
    activeRef.current = false;
    trackerRef.current = null;
    setRoute(null);
    onReadyRef.current();
  }, []);

  const plan = useCallback(
    (target: string) => {
      const live = useSmartCubeStore.getState().liveFacelets;
      if (live === scrambleToFacelets(target)) {
        complete();
        return;
      }
      // From a solved cube the setup is simply the scramble itself.
      if (live === SOLVED_FACELETS) {
        const turns = target.split(/\s+/).filter(Boolean);
        trackerRef.current = new RouteTracker(turns);
        setRoute({ turns, position: 0, partial: false });
        return;
      }
      getCubeEngineClient()
        .computeCorrectiveMoves(target, live)
        .then((turns) => {
          if (!activeRef.current || targetRef.current !== target) return;
          trackerRef.current = new RouteTracker(turns);
          setRoute({ turns, position: 0, partial: false });
        })
        .catch(() => setRoute(null));
    },
    [complete],
  );

  const begin = useCallback(
    (target: string) => {
      targetRef.current = target;
      activeRef.current = true;
      trackerRef.current = null;
      setRoute(null);
      plan(target);
    },
    [plan],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    trackerRef.current = null;
    setRoute(null);
  }, []);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (!activeRef.current) return;
      const tracker = trackerRef.current;
      const event = tracker?.push(m.token);
      // The store applies the move right after this bus emits.
      window.setTimeout(() => {
        if (!activeRef.current) return;
        if (useSmartCubeStore.getState().liveFacelets === scrambleToFacelets(targetRef.current)) complete();
        else if (!tracker || event === "off-route") plan(targetRef.current);
        else setRoute((r) => (r ? { ...r, position: tracker.position, partial: tracker.partial } : r));
      }, 0);
    });
  }, [plan, complete]);

  return { route, begin, stop };
}
