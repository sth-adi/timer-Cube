"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { planNext } from "@/lib/satnav/client";
import type { NavStep } from "@/lib/satnav/planner";
import { RouteTracker } from "@/lib/smartcube/route";

/** Wait this long after an off-route turn before recalculating — people often fix a slip themselves in the next turn or two. */
const REROUTE_DEBOUNCE_MS = 450;

export type NavStatus = "planning" | "following" | "recalculating" | "error";

export interface NavState {
  step: NavStep | null;
  position: number;
  partial: boolean;
  status: NavStatus;
}

/**
 * The Sat-Nav's route-following loop: plans the next leg from the live
 * cube, ticks turns off as they come in, and recalculates (debounced) when
 * one goes off-route. `onMove` sees every raw turn first; `onStep` every
 * freshly planned leg.
 */
export function useSatNavRoute(opts: { onMove?: (token: string) => void; onStep?: (step: NavStep) => void } = {}) {
  const [nav, setNav] = useState<NavState>({ step: null, position: 0, partial: false, status: "planning" });
  const [reroutes, setReroutes] = useState(0);
  const trackerRef = useRef<RouteTracker | null>(null);
  const requestRef = useRef(0);
  const rerouteTimer = useRef<number | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const replan = useCallback(() => {
    const id = ++requestRef.current;
    trackerRef.current = null;
    planNext(useSmartCubeStore.getState().liveFacelets)
      .then((step) => {
        if (id !== requestRef.current) return;
        trackerRef.current = new RouteTracker(step.turns);
        setNav({ step, position: 0, partial: false, status: "following" });
        optsRef.current.onStep?.(step);
      })
      .catch(() => id === requestRef.current && setNav((n) => ({ ...n, status: "error" })));
  }, []);

  useEffect(() => {
    replan();
  }, [replan]);

  useEffect(() => {
    return subscribeRawMoves((move) => {
      optsRef.current.onMove?.(move.token);
      const tracker = trackerRef.current;
      if (!tracker) {
        // Mid-recalculation: the plan in flight is already stale — ask again once they pause.
        if (rerouteTimer.current) window.clearTimeout(rerouteTimer.current);
        rerouteTimer.current = window.setTimeout(replan, REROUTE_DEBOUNCE_MS);
        return;
      }
      const event = tracker.push(move.token);
      if (event === "off-route") {
        trackerRef.current = null;
        setReroutes((r) => r + 1);
        setNav((n) => ({ ...n, status: "recalculating" }));
        if (rerouteTimer.current) window.clearTimeout(rerouteTimer.current);
        rerouteTimer.current = window.setTimeout(replan, REROUTE_DEBOUNCE_MS);
        return;
      }
      setNav((n) => ({ ...n, position: tracker.position, partial: tracker.partial }));
      // Let the store apply this turn to the live state before planning from it.
      if (event === "done") window.setTimeout(replan, 30);
    });
  }, [replan]);

  useEffect(() => () => void (rerouteTimer.current && window.clearTimeout(rerouteTimer.current)), []);

  return { nav, reroutes, replan };
}
