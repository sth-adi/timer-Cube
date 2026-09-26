"use client";

import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { liveMilestones, milestoneTimes } from "@/lib/pacer/pacer";
import { buildProjectionModel, projectAtTime, projectLive, type Projection } from "@/lib/analysis/liveProjection";
import { solveFinalMs } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * Live projection during a smart-cube solve: from the cross on, where this
 * solve is heading at your own pace, updated at every milestone — and,
 * once it's done, the trail of calls it made next to the real result.
 */
export function LiveProjection({ finished, finalMs }: { finished: boolean; finalMs: number }) {
  const solves = useSessionStore((s) => s.solves);
  const startedAtMs = useSmartCubeStore((s) => s.startedAtMs);
  const crossAtMs = useSmartCubeStore((s) => s.crossAtMs);
  const f2lPairAtMs = useSmartCubeStore((s) => s.f2lPairAtMs);
  const f2lAtMs = useSmartCubeStore((s) => s.f2lAtMs);
  const ollAtMs = useSmartCubeStore((s) => s.ollAtMs);

  // Only meaningful once finished — mid-solve finalMs ticks every frame and mustn't rebuild the model.
  const excludeMs = finished ? finalMs : null;
  const model = useMemo(() => {
    // Once this solve is saved, judge the calls against a model that never saw it.
    const latest = solves.reduce<(typeof solves)[number] | null>((a, s) => (!a || s.date > a.date ? s : a), null);
    const pool = excludeMs !== null && latest?.timeMs === excludeMs ? solves.filter((s) => s !== latest) : solves;
    const smart = pool.filter((s) => s.scramble && s.reconstruction && s.moveTimestamps?.length && s.penalty !== "dnf");
    const history = smart.map((s) =>
      milestoneTimes({ scramble: s.scramble, moves: s.reconstruction!.split(/\s+/).filter(Boolean), timesMs: s.moveTimestamps! }),
    );
    const finals = pool.map(solveFinalMs).filter((x): x is number => x !== null);
    return buildProjectionModel(history, finals.length ? Math.min(...finals) : null);
  }, [solves, excludeMs]);

  // Every call the projection has made so far this solve, one per milestone reached.
  const trail = useMemo(() => {
    const live = liveMilestones({ startedAtMs, crossAtMs, f2lPairAtMs, f2lAtMs, ollAtMs, solvedAtMs: null });
    const out: Projection[] = [];
    for (let i = 0; i < 6; i++) {
      if (live[i] === null) continue;
      const p = projectLive(
        model,
        live.map((v, j) => (j <= i ? v : null)),
      );
      if (p && p.k === i) out.push(p);
    }
    return out;
  }, [model, startedAtMs, crossAtMs, f2lPairAtMs, f2lAtMs, ollAtMs]);

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
