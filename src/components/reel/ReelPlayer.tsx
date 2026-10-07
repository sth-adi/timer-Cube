"use client";

import { useCallback, useMemo } from "react";
import { INTRO_MS, OUTRO_MS, renderReelFrame } from "@/lib/reel/renderFrame";
import { reelSoundtrack } from "@/lib/reel/highlights";
import type { ReelTimeline } from "@/lib/reel/timeline";
import { CanvasRecorder } from "./CanvasRecorder";
import { useReelTheme } from "./useReelTheme";

interface ReelPlayerProps {
  timeline: ReelTimeline;
  title: string;
  subtitle: string;
  fileName: string;
  pb?: boolean;
  /** Small watermark at the foot of the card — a username, or the app's name. */
  credit?: string;
}

/** A single-solve Solve Reel: plays on a canvas and records to a video file, soundtrack included. */
export function ReelPlayer({ timeline, title, subtitle, fileName, pb = false, credit = "Cube" }: ReelPlayerProps) {
  const theme = useReelTheme();
  const style = useMemo(() => ({ ...theme, title, subtitle, credit }), [theme, title, subtitle, credit]);
  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number) => renderReelFrame(ctx, timeline, t, style), [timeline, style]);
  const soundtrack = useMemo(() => reelSoundtrack(timeline, INTRO_MS, pb), [timeline, pb]);
  return (
    <CanvasRecorder
      draw={draw}
      fromT={-INTRO_MS}
      toT={timeline.totalMs + OUTRO_MS}
      posterT={-1}
      soundtrack={soundtrack}
      title={title}
      fileName={fileName}
      ariaLabel="Solve reel preview"
    />
  );
}
