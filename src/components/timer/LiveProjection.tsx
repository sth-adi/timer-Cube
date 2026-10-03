"use client";

import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { liveMilestones } from "@/lib/pacer/pacer";
import { buildProjectionModel, projectAtTime, projectLive, projectPreSolve, solveMilestoneTimes, type Projection } from "@/lib/analysis/liveProjection";
import { useSolvePrediction } from "@/lib/prediction/useSolvePrediction";
import { normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { solveFinalMs, type EventTag } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * Live projection during a smart-cube solve: from the moment the scramble
 * appears, where this solve is heading at your own pace — first from the
 * scramble's own difficulty (the same pre-solve regression the scramble bar
 * shows, see prediction.ts), then handed off to a milestone-based call the
 * instant the cross is done, updated at every milestone after. Once it's
 * done, the trail of calls it made sits next to the real result.
 */
export function LiveProjection({
  finished,
  finalMs,
  scramble,
  pendingEvent = null,
}: {
  finished: boolean;
  finalMs: number;
  scramble?: string;
  /** Which event this attempt is tagged as — the projection model and pre-solve prediction are both built from that event's own history only, same convention as the ghost target and coach card. */
  pendingEvent?: EventTag | null;
}) {
  const solves = useSessionStore((s) => s.solves);
  const startedAtMs = useSmartCubeStore((s) => s.startedAtMs);
  const crossAtMs = useSmartCubeStore((s) => s.crossAtMs);
  const f2lPairAtMs = useSmartCubeStore((s) => s.f2lPairAtMs);
  const f2lAtMs = useSmartCubeStore((s) => s.f2lAtMs);
  const ollAtMs = useSmartCubeStore((s) => s.ollAtMs);

  const eventSolves = useMemo(
    () => (pendingEvent === null ? normalSolves(solves) : solvesForEvent(solves, pendingEvent)),
    [solves, pendingEvent],
  );

  // Only meaningful once finished — mid-solve finalMs ticks every frame and mustn't rebuild the model.
  const excludeMs = finished ? finalMs : null;
  const model = useMemo(() => {
    // Once this solve is saved, judge the calls against a model that never saw it.
    const latest = eventSolves.reduce<(typeof eventSolves)[number] | null>((a, s) => (!a || s.date > a.date ? s : a), null);
    const pool = excludeMs !== null && latest?.timeMs === excludeMs ? eventSolves.filter((s) => s !== latest) : eventSolves;
    const smart = pool.filter((s) => s.scramble && s.reconstruction && s.moveTimestamps?.length && s.penalty !== "dnf");
    // Replaying every smart solve is ~1ms each; solveMilestoneTimes caches per solve, so a new solve replays only itself.
    const history = smart.map(solveMilestoneTimes);
    const finals = pool.map(solveFinalMs).filter((x): x is number => x !== null);
    return buildProjectionModel(history, finals.length ? Math.min(...finals) : null);
  }, [eventSolves, excludeMs]);

  // Before the cross is even done, the scramble's own difficulty is already
  // a signal — the same pre-solve regression the scramble bar shows (see
  // prediction.ts) — so the projection has something to say from the very
  // start of the solve instead of sitting silent until the first milestone.
  // Trained in the prediction worker and cached by history, so this never blocks a frame.
  const preSolvePrediction = useSolvePrediction(eventSolves, scramble ?? "");
  const preSolveCall = useMemo(() => projectPreSolve(model, preSolvePrediction), [model, preSolvePrediction]);

  // Every call the projection has made so far this solve, one per milestone reached.
  const trail = useMemo(() => {
    const live = liveMilestones({ startedAtMs, crossAtMs, f2lPairAtMs, f2lAtMs, ollAtMs, solvedAtMs: null });
    const out: Projection[] = [];
    if (preSolveCall) out.push(preSolveCall);
    for (let i = 0; i < 6; i++) {
      if (live[i] === null) continue;
      const p = projectLive(
        model,
        live.map((v, j) => (j <= i ? v : null)),
      );
      if (p && p.k === i) out.push(p);
    }
    return out;
  }, [model, startedAtMs, crossAtMs, f2lPairAtMs, f2lAtMs, ollAtMs, preSolveCall]);

  const last = trail[trail.length - 1];
  if (!last) return null;
  // Mid-solve, the latest call ages with the clock; after, the calls stand as made.
  const current = finished ? last : projectAtTime(model, last, finalMs);

  if (finished) {
    const first = trail[0];
    const err = Math.abs(current.projectedMs - finalMs);
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-muted-2">
        <TrendingDown size={11} className="text-accent" />
        {trail.map((p) => (
          <span key={p.k}>
            {p.milestone} ~{formatTime(p.projectedMs)} →
          </span>
        ))}
        <span className="font-semibold text-foreground">{formatTime(finalMs)}</span>
        <span>
          · called {err < 300 ? "it" : `within ${(err / 1000).toFixed(1)}s`} from {current.milestone}
          {first !== current ? `, ${(Math.abs(first.projectedMs - finalMs) / 1000).toFixed(1)}s off from ${first.milestone}` : ""}
        </span>
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl px-3 py-1.5",
        current.pbPace ? "bg-success/15 text-success" : current.headline === "PB in reach" ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-foreground",
      )}
    >
      <p className="text-sm font-bold tabular-nums">
        {current.headline} · ~{formatTime(current.projectedMs)} <span className="text-[11px] font-medium opacity-70">±{(current.errMs / 1000).toFixed(1)}</span>
      </p>
      <p className="text-[10px] opacity-80">{current.detail}</p>
    </div>
  );
}
