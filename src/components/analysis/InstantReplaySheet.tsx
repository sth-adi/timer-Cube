"use client";

import { useId, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { formatResult } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { computeReplayGaps } from "@/lib/analysis/replayGaps";
import { displayIndexForMove, displayMoves } from "@/lib/analysis/replayDisplay";
import { phaseMarksFromMilestones } from "@/lib/analysis/replayTiming";
import { hasBreakdown, solveBreakdown } from "@/lib/analysis/solveBreakdown";
import { solveFinalMs, type EventTag, type Penalty, type Solve } from "@/types";
import { useModalLayer } from "@/hooks/useModalLayer";
import { faceletsAfterMoves } from "@/lib/gyro/replayGyro";
import { useReplayGhostOption } from "./useReplayGhost";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";
import { ReplayGyroTwin } from "./ReplayGyroTwin";
import { ReplayPlaceholder } from "@/components/lab/CubeStage";

/** The cube's box: sized once here, so the placeholder and the real player agree. */
const CUBE_BOX = "mx-auto h-60 w-full max-w-md sm:h-72 [@media(orientation:landscape)_and_(max-height:32rem)]:h-44";

const TimedCubePlayer = dynamic(() => import("./TimedCubePlayer").then((m) => m.TimedCubePlayer), {
  ssr: false,
  loading: () => <ReplayPlaceholder className={CUBE_BOX} />,
});

interface InstantReplaySheetProps {
  scramble: string;
  reconstruction: string;
  /** The raw clock time; a `penalty` is applied on top for the time shown. */
  timeMs: number;
  /** A +2 or DNF on the solve, so the heading agrees with the recap's: defaults to none. */
  penalty?: Penalty;
  /** Elapsed ms from solve start for each move, one-for-one with `reconstruction`'s tokens — real capture timing off a smart cube, not a retyped guess. */
  moveTimestamps?: number[];
  /** The solve's recorded cube orientation (see lib/gyro/solveGyro): when there is one, a small Gyro Twin tilts with it over the replay. */
  gyroStream?: GyroStreamData | null;
  /** The solve's id, date and event when the caller has them: a "vs PB" ghost is then your best solve from before this one, in the same event. */
  solveId?: string;
  date?: number;
  event?: EventTag;
  onClose: () => void;
}

/**
 * A zero-latency "watch it back" view: scramble, reconstruction, and a
 * real-paced 3D replay, all from data already sitting in memory — no
 * analyzeSolve() worker round trip, no navigating away from the timer. This
 * is deliberately lighter than the full Analyzer (no phase-by-phase
 * optimal-solution comparison): it's the fast "let me see that again" replay
 * Cubeast's own post-solve screen offers, not a second copy of the analyzer.
 */
export function InstantReplaySheet({ scramble, reconstruction, timeMs, penalty = "none", moveTimestamps, gyroStream, solveId, date, event, onClose }: InstantReplaySheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalLayer(dialogRef, onClose);
  const moves = useMemo(() => reconstruction.trim().split(/\s+/).filter(Boolean), [reconstruction]);

  const { gaps, hasRealTiming } = useMemo(() => computeReplayGaps(moves, moveTimestamps), [moveTimestamps, moves]);

  // What's read under the cube: the same slice-pair merge as the recap's
  // written reconstruction ("M", not "R' L"). The player below still gets the
  // raw `reconstruction`, which is what the cube actually did.
  const display = useMemo(() => displayMoves(moves, hasRealTiming ? moveTimestamps : undefined), [moves, moveTimestamps, hasRealTiming]);

  // Phase ticks from the milestones the recap itself uses, rebuilt from this
  // solve's own moves (a typed-in or hand-edited reconstruction has none).
  const marks = useMemo(() => {
    if (!hasRealTiming || !moveTimestamps) return undefined;
    const probe = { id: "replay", sessionId: "", penalty: "none", scramble, reconstruction, moveTimestamps, timeMs, date: 0 } as Solve;
    try {
      if (!hasBreakdown(probe)) return undefined;
      const b = solveBreakdown(probe);
      return b ? phaseMarksFromMilestones(moveTimestamps, b.milestones) : undefined;
    } catch {
      return undefined;
    }
  }, [hasRealTiming, moveTimestamps, scramble, reconstruction, timeMs]);

  // The Gyro Twin's stickers: the cube after each move, so it shows what the real cube showed.
  const faceletsAfter = useMemo(() => (gyroStream && hasRealTiming ? faceletsAfterMoves(scramble, moves) : null), [gyroStream, hasRealTiming, scramble, moves]);

  const ghost = useReplayGhostOption({ id: solveId, scramble, timeMs, date, event }, hasRealTiming, moves.length, timeMs);

  const moveText = (active: number) => {
    if (display.length === 0) {
      return <p className="w-full break-words rounded-xl bg-bg-panel-2/60 px-3 py-2 text-center font-mono text-xs leading-relaxed text-muted">no reconstruction captured</p>;
    }
    const current = displayIndexForMove(display, active);
    return (
      <p className="w-full break-words rounded-xl bg-bg-panel-2/60 px-3 py-2 text-center font-mono text-xs leading-[1.9] text-foreground/80">
        {display.map((d, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span
              aria-current={i === current ? "step" : undefined}
              className={cn("rounded px-1 py-0.5 transition-colors", i === current && "bg-accent-soft font-semibold text-accent")}
            >
              {d.token}
            </span>
          </span>
        ))}
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "glass-panel w-full rounded-t-2xl outline-none p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[88vh] supports-[height:1dvh]:max-h-[88dvh] overflow-y-auto",
          "sm:max-w-md sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up md:max-w-lg",
          // A phone on its side is short: give the sheet the width so the cube can sit beside the text.
          "[@media(orientation:landscape)_and_(max-height:32rem)]:max-w-3xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border-strong sm:hidden" />
        <div className="mb-2 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">Replay</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2.5 rounded-md text-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="[@media(orientation:landscape)_and_(max-height:32rem)]:grid [@media(orientation:landscape)_and_(max-height:32rem)]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] [@media(orientation:landscape)_and_(max-height:32rem)]:items-start [@media(orientation:landscape)_and_(max-height:32rem)]:gap-x-5">
          <div>
            <p className="mb-2.5 flex items-baseline gap-2">
              <span className="tabular-timer text-3xl font-bold leading-none tracking-tight text-foreground">{formatResult(solveFinalMs({ timeMs, penalty }), penalty)}</span>
              <span className="text-xs text-muted">{display.length} moves</span>
            </p>

            <p className="mb-3 break-words rounded-xl bg-bg-panel-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
              {scramble}
            </p>
          </div>

          <TimedCubePlayer
            alg={reconstruction}
            setupAlg={scramble}
            gapsMs={gaps}
            hasRealTiming={hasRealTiming}
            marks={marks}
            renderMoves={moveText}
            ghost={ghost}
            gyro={gyroStream && hasRealTiming && moveTimestamps ? { stream: gyroStream, moveMs: moveTimestamps } : undefined}
            overlay={
              gyroStream && faceletsAfter && moveTimestamps
                ? ({ positionMs, playing, speed, timeline }) => (
                    <ReplayGyroTwin
                      stream={gyroStream}
                      faceletsAfter={faceletsAfter}
                      moveMs={moveTimestamps}
                      starts={timeline.starts}
                      ends={timeline.ends}
                      moves={moves}
                      positionMs={positionMs}
                      playing={playing}
                      speed={speed}
                    />
                  )
                : undefined
            }
            className={CUBE_BOX}
          />
        </div>
      </div>
    </div>
  );
}
