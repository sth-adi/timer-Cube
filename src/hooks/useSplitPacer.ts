"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { usePacerStore } from "@/lib/store/pacerStore";
import { MILESTONES, liveMilestones, milestoneTimes, paceVerdict, personalShape, targetSplits } from "@/lib/pacer/pacer";
import { playPaceTone } from "@/lib/utils/sound";

/** How many recent smart-cube solves the pacer learns your shape from. */
const SHAPE_HISTORY = 50;

/** Your solve shape, learned from recent smart-cube solves (see personalShape). */
export function usePersonalShape() {
  const allSolves = useSessionStore((s) => s.allSolves);
  return useMemo(() => {
    const recent = allSolves
      .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
      .sort((a, b) => a.date - b.date)
      .slice(-SHAPE_HISTORY);
    return personalShape(
      recent.map((s) => milestoneTimes({ scramble: s.scramble, moves: s.reconstruction!.split(/\s+/).filter(Boolean), timesMs: s.moveTimestamps! })),
    );
  }, [allSolves]);
}

export interface PaceCall {
  index: number;
  deltaMs: number;
}

/**
 * Split Pacer, live: watches the smart cube's milestones as a solve runs
 * and, for each one, plays a tone saying whether you're ahead of or behind
 * the target split. Only the furthest new milestone in a burst gets a
 * tone, so two pairs landing together make one call, not two.
 */
export function useSplitPacer() {
  const enabled = usePacerStore((s) => s.enabled);
  const targetMs = usePacerStore((s) => s.targetMs);
  const { shape } = usePersonalShape();
  const targets = useMemo(() => targetSplits(targetMs, shape), [targetMs, shape]);
  const [calls, setCalls] = useState<PaceCall[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let reached = new Set<number>();
    return useSmartCubeStore.subscribe((s, prev) => {
      if (s.startedAtMs !== prev.startedAtMs) {
        reached = new Set();
        setCalls([]);
      }
      if (s.startedAtMs === null) return;
      const live = liveMilestones(s);
      const fresh: PaceCall[] = [];
      live.forEach((t, k) => {
        if (t !== null && !reached.has(k)) {
          reached.add(k);
          fresh.push({ index: k, deltaMs: t - targets[k] });
        }
      });
      if (fresh.length === 0) return;
      playPaceTone(paceVerdict(fresh[fresh.length - 1].deltaMs));
      setCalls((c) => [...c, ...fresh]);
    });
  }, [enabled, targets]);

  return { enabled, targetMs, targets, calls, milestones: MILESTONES };
}
