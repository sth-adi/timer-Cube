"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import type { Ghost } from "@/lib/rematch/ghost";
import { modelGhost, pbGhost, pickGhostSolve, type GhostTarget } from "@/lib/analysis/replayGhost";
import { useSessionStore } from "@/lib/store/sessionStore";

/** What a replay can offer to race beside the viewer's own cube. */
export interface ReplayGhostOption {
  kind: "pb" | "model";
  /** The toggle's text: what the viewer is comparing against. */
  toggle: string;
  /** The caption under the ghost cube. */
  caption: string;
  /** The ghost's moves and times. A model solution is worked out on first ask; null if that fails. */
  load: () => Promise<Ghost | null>;
}

/** A scramble's model solution, worked out once however many replays ask. */
const modelSolutions = new Map<string, Promise<string[] | null>>();

function solveModel(scramble: string): Promise<string[] | null> {
  let hit = modelSolutions.get(scramble);
  if (!hit) {
    hit = getCubeEngineClient()
      .solveCFOP(scramble)
      .then((s) => s.full)
      .catch(() => null);
    modelSolutions.set(scramble, hit);
    hit.then((r) => {
      if (!r) modelSolutions.delete(scramble);
    });
  }
  return hit;
}

/**
 * The ghost this replay can offer: your fastest earlier smart-cube solve, or a model solution of the
 * same scramble at your pace when there is none. Null when `enabled` is false (a phase on its own, an
 * estimated-pace replay), or the replay has no scramble to race on. `moveCount` and `totalMs` are the
 * replayed solve's, for pacing the model solution.
 */
export function useReplayGhostOption(target: GhostTarget, enabled: boolean, moveCount: number, totalMs: number): ReplayGhostOption | null {
  const allSolves = useSessionStore((s) => s.allSolves);
  const { id, scramble, timeMs, date, event } = target;
  return useMemo(() => {
    if (!enabled || !scramble.trim() || !(totalMs > 0)) return null;
    const pb = pickGhostSolve(allSolves, { id, scramble, timeMs, date, event });
    if (pb) {
      const { ghost, label } = pbGhost(pb, totalMs);
      return { kind: "pb", toggle: "vs PB", caption: label, load: () => Promise.resolve(ghost) };
    }
    if (moveCount < 1) return null;
    return {
      kind: "model",
      toggle: "vs model",
      caption: "Model solution",
      load: async () => {
        const moves = await solveModel(scramble);
        return moves ? modelGhost(scramble, moves, moveCount, totalMs) : null;
      },
    };
  }, [allSolves, enabled, id, scramble, timeMs, date, event, moveCount, totalMs]);
}

export interface ReplayGhostControl {
  on: boolean;
  /** "loading" while a model solution is being worked out. */
  status: "idle" | "loading" | "ready" | "failed";
  ghost: Ghost | null;
  toggle: () => void;
}

/** The ghost's on/off switch (off until asked for) and its data, loaded the first time it is switched on. */
export function useReplayGhostControl(option: ReplayGhostOption | null): ReplayGhostControl {
  const [on, setOn] = useState(false);
  const [state, setState] = useState<{ status: ReplayGhostControl["status"]; ghost: Ghost | null }>({ status: "idle", ghost: null });
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const toggle = useCallback(() => {
    if (!option) return;
    const next = !on;
    setOn(next);
    if (!next || state.status === "loading" || state.status === "ready") return;
    setState({ status: "loading", ghost: null });
    option.load().then(
      (ghost) => {
        if (aliveRef.current) setState(ghost ? { status: "ready", ghost } : { status: "failed", ghost: null });
      },
      () => {
        if (aliveRef.current) setState({ status: "failed", ghost: null });
      },
    );
  }, [option, on, state.status]);
  return { on: on && !!option, status: state.status, ghost: state.ghost, toggle };
}
