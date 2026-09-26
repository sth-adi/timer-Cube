"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { analyzableSolves } from "@/lib/analytics/solveMetrics";
import { extractAlgExecutions, type AlgExecution } from "@/lib/xray/algMicroscope";

/** Solves read per slice, so a long history is read in the background without a stutter. */
const CHUNK = 25;
/** Shared across mounts, so two copies of the hook never read the same solves twice. */
let running = false;

/**
 * Reads every smart-cube solve (new ones as they're saved, and the back
 * catalogue once) for the OLL and PLL algorithms you executed, and hands
 * them to My Algs, which keeps your own one-look algorithms per case.
 */
export function useAlgLearner() {
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const run = () => {
      if (running || cancelled) return;
      const through = useMyAlgsStore.getState().learnedThrough;
      const todo = analyzableSolves(useSessionStore.getState().allSolves).filter((s) => s.date > through);
      if (!todo.length) return;
      running = true;
      const step = (from: number) => {
        if (cancelled) {
          running = false;
          return;
        }
        const slice = todo.slice(from, from + CHUNK);
        const executions: AlgExecution[] = [];
        for (const s of slice) {
          const moves = s.reconstruction!.split(/\s+/).filter(Boolean);
          if (moves.length !== s.moveTimestamps!.length) continue;
          try {
            executions.push(...extractAlgExecutions({ scramble: s.scramble, moves, timesMs: s.moveTimestamps!, date: s.date }));
          } catch {
            // A reconstruction that doesn't replay is simply skipped.
          }
        }
        useMyAlgsStore.getState().learn(executions, slice[slice.length - 1].date);
        if (from + CHUNK < todo.length) timer = window.setTimeout(() => step(from + CHUNK), 16);
        else {
          running = false;
          run(); // Anything saved while we were reading.
        }
      };
      step(0);
    };

    run();
    const unsub = useSessionStore.subscribe((s, prev) => {
      if (s.allSolves !== prev.allSolves) run();
    });
    return () => {
      cancelled = true;
      if (timer) running = false;
      window.clearTimeout(timer);
      unsub();
    };
  }, []);
}
