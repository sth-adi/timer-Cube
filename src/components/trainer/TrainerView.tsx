"use client";

import { useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { RotateCcw } from "lucide-react";
import { useTimer, type TimerResult } from "@/hooks/useTimer";
import { useTimerInput } from "@/hooks/useTimerInput";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useTrainerStore } from "@/lib/store/trainerStore";
import { averageOfN } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { TimerPhase } from "@/hooks/useTimer";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), { ssr: false });

const PHASE_COLOR: Record<TimerPhase, string> = {
  idle: "text-foreground",
  inspecting: "text-foreground",
  holding: "text-danger",
  ready: "text-success",
  running: "text-foreground",
  stopped: "text-foreground",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-2">{label}</span>
      <span className="tabular-timer text-base font-semibold">{value}</span>
    </div>
  );
}

export function TrainerView() {
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const mode = useTrainerStore((s) => s.mode);
  const setMode = useTrainerStore((s) => s.setMode);
  const setupAlg = useTrainerStore((s) => s.setupAlg);
  const loading = useTrainerStore((s) => s.loading);
  const error = useTrainerStore((s) => s.error);
  const times = useTrainerStore((s) => s.times[mode]);
  const loadNext = useTrainerStore((s) => s.loadNext);
  const recordTime = useTrainerStore((s) => s.recordTime);
  const resetStats = useTrainerStore((s) => s.resetStats);

  useEffect(() => {
    if (!setupAlg && !loading) void loadNext();
    // Only on mount — mode switches go through setMode, which loads its own case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onComplete = useCallback(
    ({ timeMs: ms }: TimerResult) => {
      recordTime(ms);
      void loadNext();
    },
    [recordTime, loadNext],
  );

  const { phase, displayMs, press, release, cancel, reset } = useTimer({
    inspectionEnabled: false,
    holdToStartMs,
    onComplete,
  });

  const touch = useTimerInput({ press, release, cancel, reset });

  const best = times.length > 0 ? Math.min(...times) : null;
  const mean = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const ao12 = times.length >= 12 ? averageOfN(times.slice(-12)).value : null;

  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-3 py-2">
      <div className="flex gap-2">
        {(["f2l", "oll", "pll", "zbll"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => void setMode(m)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium uppercase transition-colors",
              mode === m ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="card relative h-52 w-full shrink-0 overflow-hidden rounded-xl">
        {setupAlg && <CubeViewer alg="" setupAlg={setupAlg} className="h-full w-full" />}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-2">
            Generating case…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 select-none touch-none"
        {...touch}
      >
        <p className={cn("tabular-timer text-[16vw] leading-none font-bold sm:text-7xl", PHASE_COLOR[phase])}>
          {formatTime(displayMs)}
        </p>
        {phase === "idle" && <p className="text-muted-2 text-sm">hold space to start</p>}
      </div>

      <div className="card grid w-full grid-cols-3 gap-3 rounded-xl p-3">
        <Stat label="best" value={best !== null ? formatTime(best) : "—"} />
        <Stat label="mean" value={mean !== null ? formatTime(mean) : "—"} />
        <Stat label="ao12" value={ao12 !== null ? formatTime(ao12) : "—"} />
      </div>

      <button
        type="button"
        onClick={() => resetStats(mode)}
        disabled={times.length === 0}
        className="flex items-center gap-1.5 text-xs text-muted-2 hover:text-muted disabled:opacity-40"
      >
        <RotateCcw size={11} />
        {times.length} practiced — reset
      </button>
    </div>
  );
}
