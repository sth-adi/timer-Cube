"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ReplayTimeline } from "@/lib/analysis/replayTiming";
import { displayIndexForMove } from "@/lib/analysis/replayDisplay";
import { phaseAt, stageClockMs, type ReplayStageInfo } from "@/lib/analysis/replayStage";
import { MoveGrid } from "./MoveGrid";
import { StackmatTimer } from "./StackmatTimer";
import { useElementWidth } from "./useElementWidth";
import { useSmoothPosition } from "./useSmoothPosition";
import { useStageBackground } from "./useStageBackground";
import "@/styles/replaystage.css";

/**
 * The look of a speedcubing reel around the replay's cube: a flat colour field (per theme, see
 * styles/replaystage.css), the move grid across the top, the cube floating in the middle and a stackmat
 * along the bottom that runs on the replay's clock and stops at the final time. When the replay reaches its
 * end the grid gives way to an end card: the time in a big serif, an italic caption, a thin rule and a few
 * tiny lines of detail, with the cube still in view.
 *
 * It only draws. The replay's position, active move and timeline come from the player (see TimedCubePlayer's
 * `overlay`), the words from `info`, and the cube itself is `children`.
 *
 * `fit` says how the card is sized: "sheet" lets the viewport's height decide (the instant replay sheet, with
 * little else on screen), "page" a fixed phone-sized card in the flow of a page.
 */
export function ReplayStage({
  info,
  positionMs,
  activeMove,
  timeline,
  playing,
  speed,
  atEnd,
  fit = "page",
  cube3d = false,
  className,
  children,
}: {
  info: ReplayStageInfo;
  positionMs: number;
  activeMove: number;
  timeline: ReplayTimeline;
  playing: boolean;
  speed: number;
  atEnd: boolean;
  fit?: "sheet" | "page";
  /** The cube is the 3D renderer: it draws its own contact shadow and motion blur, so the stage adds neither. */
  cube3d?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [topRef, topWidth] = useElementWidth<HTMLDivElement>();
  const bg = useStageBackground();
  const current = displayIndexForMove(info.moves, activeMove);
  const turning = activeMove >= 0 && positionMs < (timeline.ends[activeMove] ?? 0);
  const phase = phaseAt(info.marks, activeMove);
  const tokens = info.moves.map((m) => m.token);
  const unit = info.resultUnit ?? (/\d$/.test(info.resultLabel) ? "s" : "");
  const timeChars = info.resultLabel.length;
  // The big time fills about nine tenths of the card's width, up to a quarter of it per character pair.
  const timeSize = `min(24cqw, ${(90 / Math.max(timeChars, 3) / 0.52).toFixed(2)}cqw)`;
  return (
    <div
      className={["replay-stage", className].filter(Boolean).join(" ")}
      data-testid="replay-stage"
      data-fit={fit}
      data-bg={bg}
      data-cube3d={cube3d ? "true" : undefined}
      data-end={atEnd ? "true" : "false"}
      data-playing={playing ? "true" : "false"}
    >
      <div ref={topRef} className="replay-stage__top" aria-hidden={atEnd}>
        <MoveGrid tokens={tokens} current={current} turning={turning} title={info.title ?? "Reconstruction"} phase={phase} widthPx={topWidth} />
      </div>

      <div className="replay-end" aria-hidden={!atEnd} data-testid="replay-end-card" style={{ "--time-size": timeSize } as CSSProperties}>
        <p className="replay-end__time">
          <span>{info.resultLabel}</span>
          {unit && <sup>{unit}</sup>}
        </p>
        <p className="replay-end__caption">{info.caption}</p>
        <hr className="replay-end__rule" />
        <ul className="replay-end__meta">
          {info.meta.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="replay-stage__cube">{children}</div>

      <div className="replay-stage__timer">
        <StageClock info={info} positionMs={positionMs} timeline={timeline} playing={playing} speed={speed} atEnd={atEnd} />
      </div>
    </div>
  );
}

/** The stackmat on the replay's clock; split out so the per-frame clock only re-renders it. */
function StageClock({
  info,
  positionMs,
  timeline,
  playing,
  speed,
  atEnd,
}: {
  info: ReplayStageInfo;
  positionMs: number;
  timeline: ReplayTimeline;
  playing: boolean;
  speed: number;
  atEnd: boolean;
}) {
  const smooth = useSmoothPosition(positionMs, playing && !atEnd, speed, timeline.durationMs);
  const ms = stageClockMs({ positionMs: smooth, durationMs: timeline.durationMs, atEnd, starts: timeline.starts, moveMs: info.moveMs, finalMs: info.clockMs });
  return <StackmatTimer ms={ms} running={playing && !atEnd} className="replay-stage__stackmat" />;
}
