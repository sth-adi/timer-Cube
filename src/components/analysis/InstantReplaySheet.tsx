"use client";

import { useId, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { formatResult } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { computeReplayGaps } from "@/lib/analysis/replayGaps";
import { displayMoves } from "@/lib/analysis/replayDisplay";
import { phaseMarksFromMilestones } from "@/lib/analysis/replayTiming";
import { hasBreakdown, solveBreakdown } from "@/lib/analysis/solveBreakdown";
import { solveFinalMs, type EventTag, type Penalty, type Solve } from "@/types";
import { useModalLayer } from "@/hooks/useModalLayer";
import { faceletsAfterMoves } from "@/lib/gyro/replayGyro";
import { useReplayGhostOption } from "./useReplayGhost";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";
import { ReplayGyroTwin } from "./ReplayGyroTwin";
import { StagePlaceholder } from "@/components/replay/StagePlaceholder";
import { useSessionStore } from "@/lib/store/sessionStore";
import { bigTime, eventCaption, isPersonalBest, tpsLabel, type ReplayStageInfo } from "@/lib/analysis/replayStage";

// The player is drawn on the replay stage (components/replay): a coloured card sized by the viewport, so the placeholder is the same card.
const TimedCubePlayer = dynamic(() => import("./TimedCubePlayer").then((m) => m.TimedCubePlayer), {
  ssr: false,
  loading: () => <StagePlaceholder fit="sheet" />,
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

  // The end card's caption: a personal best when this beat every earlier solve of the event, else the event.
  const allSolves = useSessionStore((st) => st.allSolves);
  const isPb = useMemo(() => isPersonalBest(allSolves, { id: solveId, timeMs, penalty, date, event }), [allSolves, solveId, timeMs, penalty, date, event]);
  const finalMs = solveFinalMs({ timeMs, penalty });
  const stage = useMemo<ReplayStageInfo | null>(() => {
    if (display.length === 0) return null;
    const meta: string[] = [];
    if (date) meta.push(new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
    meta.push(`${display.length} moves`);
    const tps = tpsLabel(moves.length, timeMs);
    if (tps) meta.push(tps);
    if (penalty === "plus2") meta.push("+2 penalty");
    return {
      moves: display,
      marks,
      clockMs: timeMs,
      resultLabel: finalMs === null ? "DNF" : bigTime(finalMs),
      caption: isPb ? "Personal best" : eventCaption("3x3", event),
      meta,
      moveMs: hasRealTiming ? moveTimestamps : undefined,
    };
  }, [display, marks, timeMs, finalMs, penalty, date, event, isPb, moves.length, hasRealTiming, moveTimestamps]);

  // Under the controls: the scramble (the grid on the stage already is the move text); without a reconstruction, say so.
  const moveText = () => (
    <p className="w-full break-words rounded-xl bg-bg-panel-2/60 px-3 py-2 text-center font-mono text-xs leading-relaxed text-muted max-sm:sr-only">
      {display.length === 0 ? "no reconstruction captured" : <><span className="mr-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-2">Scramble</span>{scramble}</>}
    </p>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "glass-panel w-full rounded-t-2xl outline-none p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[96vh] supports-[height:1dvh]:max-h-[96dvh] overflow-y-auto",
          // Wide enough for the phone-shaped card with the controls beside it.
          "sm:max-w-3xl sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up",
          // A phone on its side is short: the card and the controls sit side by side there too.
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

        <div>
          {/* The stage carries the time and the moves; screen readers still get them here. */}
          <p className="sr-only">
            {formatResult(finalMs, penalty)}, {display.length} moves
          </p>

          <TimedCubePlayer
            alg={reconstruction}
            setupAlg={scramble}
            gapsMs={gaps}
            hasRealTiming={hasRealTiming}
            marks={marks}
            renderMoves={moveText}
            stage={stage}
            stageFit="sheet"
            className="mx-auto h-60 w-full max-w-md"
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
          />
        </div>
      </div>
    </div>
  );
}
